import { Hono } from 'hono';
import { now, todayUK, addDays, logActivity, all } from '../db.js';
import { getSetting, setSetting } from '../settings.js';
import { invoiceState, formatNumber, taxYear, templateVars, fill } from '../invoice-logic.js';
import { emailReady, sendMail } from '../mail.js';
import { linkClient } from '../clients.js';

const app = new Hono();
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');

const view = (inv, today = todayUK()) => ({ ...inv, items: JSON.parse(inv.items || '[]'), state: invoiceState(inv, today) });

function cleanItems(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('Add at least one line');
  const out = list.slice(0, 30).map((it) => {
    const description = String(it?.description ?? '').trim().slice(0, 200);
    const pence = Math.round(Number(it?.pence));
    if (!description) throw new Error('Each line needs a description');
    // Minus amounts are allowed (e.g. a deposit already paid), as long as the total isn't below zero.
    if (!Number.isFinite(pence)) throw new Error(`Check the amount for "${description}"`);
    return { description, pence };
  });
  if (out.reduce((a, i) => a + i.pence, 0) < 0) throw new Error("The total can't be below zero");
  return out;
}

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v));

// Takes the next number from Settings and moves the counter on.
async function takeNumber(db) {
  const cfg = await getSetting(db, 'invoicing');
  let n = cfg.nextNumber;
  // Skip any number already used (e.g. if the counter was changed by hand).
  while (await db.prepare('SELECT 1 AS x FROM invoices WHERE number = ?').bind(formatNumber(cfg.numberPrefix, n)).first('x')) n++;
  await setSetting(db, 'invoicing', { ...cfg, nextNumber: n + 1 });
  return formatNumber(cfg.numberPrefix, n);
}

export async function createInvoice(db, fields) {
  const cfg = await getSetting(db, 'invoicing');
  const issue = todayUK();
  const items = cleanItems(fields.items);
  const clientId = fields.client_id
    ?? await linkClient(db, { name: fields.client_name, email: fields.client_email, address: fields.client_address });
  const number = await takeNumber(db);
  const ts = now();
  const res = await db.prepare(`INSERT INTO invoices (number, booking_id, client_id, client_name, client_email, client_address, issue_date,
    due_date, items, total_pence, status, notes, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`)
    .bind(number, fields.booking_id ?? null, clientId, fields.client_name, fields.client_email || null, fields.client_address || null,
      issue, fields.due_date || addDays(issue, cfg.paymentTermsDays), JSON.stringify(items), items.reduce((a, i) => a + i.pence, 0),
      fields.notes || null, randomToken(), ts, ts).run();
  await logActivity(db, `Invoice ${number} created`, fields.client_name);
  return res.meta.last_row_id;
}

app.get('/', async (c) => {
  const today = todayUK();
  const rows = await all(c.env.DB.prepare(`SELECT id, number, booking_id, client_id, client_name, issue_date, due_date, total_pence, status,
    sent_at, paid_at, viewed_at, chasing_paused FROM invoices ORDER BY (status = 'paid'), due_date DESC, id DESC LIMIT 500`));
  return c.json(rows.map((r) => ({ ...r, state: invoiceState(r, today) })));
});

// Money overview: income by month and tax year, who owes what.
app.get('/report', async (c) => {
  const db = c.env.DB;
  const today = todayUK();
  const [paid, unpaid] = await db.batch([
    // Income = paid invoices + deposits (counted on the day they arrived).
    db.prepare(`SELECT substr(paid_at, 1, 10) AS paid_on, total_pence FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL
      UNION ALL
      SELECT substr(deposit_paid_at, 1, 10), deposit_pence FROM bookings WHERE deposit_paid_at IS NOT NULL AND deposit_pence > 0`),
    db.prepare(`SELECT id, number, client_name, due_date, total_pence, viewed_at, status FROM invoices WHERE status = 'sent' ORDER BY due_date`),
  ]).then((r) => r.map((x) => x.results));

  const byMonth = {};
  const byTaxYear = {};
  for (const p of paid) {
    byMonth[p.paid_on.slice(0, 7)] = (byMonth[p.paid_on.slice(0, 7)] || 0) + p.total_pence;
    const ty = taxYear(p.paid_on);
    byTaxYear[ty] = (byTaxYear[ty] || 0) + p.total_pence;
  }
  // The last 12 months, including empty ones.
  const months = [];
  const d = new Date(today.slice(0, 7) + '-15T12:00:00Z');
  for (let i = 0; i < 12; i++) {
    const key = d.toISOString().slice(0, 7);
    months.unshift({ month: key, pence: byMonth[key] || 0 });
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  const owed = {};
  for (const inv of unpaid) {
    const o = (owed[inv.client_name] ||= { client: inv.client_name, pence: 0, overduePence: 0, invoices: [] });
    o.pence += inv.total_pence;
    if (inv.due_date < today) o.overduePence += inv.total_pence;
    o.invoices.push({ id: inv.id, number: inv.number, state: invoiceState(inv, today) });
  }
  return c.json({
    currentTaxYear: taxYear(today),
    months,
    taxYears: Object.entries(byTaxYear).map(([year, pence]) => ({ year, pence })).sort((a, b) => (a.year < b.year ? 1 : -1)),
    owed: Object.values(owed).sort((a, b) => b.pence - a.pence),
  });
});

// Spreadsheet of every invoice (opens in Excel, Numbers or Google Sheets).
app.get('/export.csv', async (c) => {
  const rows = await all(c.env.DB.prepare('SELECT * FROM invoices ORDER BY issue_date, id'));
  const today = todayUK();
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Number', 'Client', 'Email', 'Issued', 'Due', 'Status', 'Total (£)', 'Paid on', 'Tax year', 'Items'];
  const lines = rows.map((r) => [r.number, r.client_name, r.client_email, r.issue_date, r.due_date, invoiceState(r, today),
    (r.total_pence / 100).toFixed(2), r.paid_at ? r.paid_at.slice(0, 10) : '', r.paid_at ? taxYear(r.paid_at.slice(0, 10)) : '',
    JSON.parse(r.items || '[]').map((i) => `${i.description} £${(i.pence / 100).toFixed(2)}`).join('; ')].map(esc).join(','));
  const deposits = await all(c.env.DB.prepare(`SELECT id, client_name, client_email, deposit_pence, deposit_paid_at FROM bookings
    WHERE deposit_paid_at IS NOT NULL AND deposit_pence > 0 ORDER BY deposit_paid_at`));
  for (const d of deposits) {
    const on = d.deposit_paid_at.slice(0, 10);
    lines.push([`DEPOSIT-${d.id}`, d.client_name, d.client_email, on, on, 'paid', (d.deposit_pence / 100).toFixed(2), on, taxYear(on),
      'Booking deposit'].map(esc).join(','));
  }
  return new Response([head.join(','), ...lines].join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ctrinn-invoices-${today}.csv"` },
  });
});

app.post('/', async (c) => {
  const input = (await c.req.json().catch(() => null)) || {};
  const client = String(input.client_name ?? '').trim().slice(0, 120);
  if (!client) return c.json({ error: "Add the client's name" }, 400);
  try {
    const id = await createInvoice(c.env.DB, {
      client_name: client, client_email: String(input.client_email ?? '').trim().slice(0, 200),
      items: input.items?.length ? input.items : [{ description: 'DJ performance', pence: 0 }],
    });
    return c.json({ id });
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
});

// Makes (or finds) the invoice for a booking, filled in from the quote. Returns { id, existing }.
export async function invoiceFromBooking(db, bookingId) {
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first();
  if (!b) return null;
  const existing = await db.prepare('SELECT id FROM invoices WHERE booking_id = ? ORDER BY id DESC LIMIT 1').bind(b.id).first();
  if (existing) return { id: existing.id, existing: true };
  const when = b.event_date ? new Date(b.event_date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  const what = [b.event_type || 'DJ performance', b.venue_name && `at ${b.venue_name}`, when && `(${when})`].filter(Boolean).join(' ');
  const club = b.kind === 'club';
  const items = [
    { description: `${club ? 'DJ set' : 'DJ performance'}: ${what}`, pence: b.price_pence || 0 },
    ...JSON.parse(b.extras || '[]').map((e) => ({ description: e.label, pence: e.pence })),
  ];
  // Deposit already paid comes off, and the balance is due on the night.
  let dueDate;
  let notes;
  if (b.deposit_paid_at && b.deposit_pence) {
    const paidOn = new Date(b.deposit_paid_at.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    items.push({ description: `Less deposit paid (${paidOn})`, pence: -b.deposit_pence });
  }
  // Club sets are invoiced with your normal payment terms instead.
  if (!club && b.event_date && b.event_date >= todayUK()) {
    dueDate = b.event_date;
    notes = 'Balance payable on the night.';
  }
  const client = b.client_id ? await db.prepare('SELECT address FROM clients WHERE id = ?').bind(b.client_id).first() : null;
  const id = await createInvoice(db, {
    booking_id: b.id, client_id: b.client_id ?? undefined, client_name: b.client_name, client_email: b.client_email,
    client_address: client?.address, items, due_date: dueDate, notes,
  });
  return { id, existing: false };
}

// One tap from a booking: everything filled in from the quote.
app.post('/from-booking/:bookingId{[0-9]+}', async (c) => {
  const r = await invoiceFromBooking(c.env.DB, Number(c.req.param('bookingId')));
  if (!r) return c.json({ error: 'Booking not found' }, 404);
  return c.json(r.existing ? r : { id: r.id });
});

// Loads an invoice, giving it a private link if it doesn't have one yet.
async function load(c) {
  const db = c.env.DB;
  const inv = await db.prepare('SELECT * FROM invoices WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (inv && !inv.token) {
    inv.token = randomToken();
    await db.prepare('UPDATE invoices SET token = ? WHERE id = ?').bind(inv.token, inv.id).run();
  }
  return inv;
}

app.get('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const inv = await load(c);
  if (!inv) return c.json({ error: 'Invoice not found' }, 404);
  const [reminders, booking] = await Promise.all([
    all(db.prepare('SELECT step, method, at FROM invoice_reminders WHERE invoice_id = ? ORDER BY at').bind(inv.id)),
    inv.booking_id ? db.prepare('SELECT id, event_type, event_date, venue_name FROM bookings WHERE id = ?').bind(inv.booking_id).first() : null,
  ]);
  return c.json({ ...view(inv), reminders, booking, emailReady: emailReady(c.env) });
});

app.patch('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const inv = await load(c);
  if (!inv) return c.json({ error: 'Invoice not found' }, 404);
  const input = (await c.req.json().catch(() => null)) || {};
  const set = {};
  try {
    for (const k of ['client_name', 'client_email', 'client_address', 'notes']) {
      if (k in input) set[k] = String(input[k] ?? '').trim().slice(0, k === 'notes' ? 2000 : 400) || null;
    }
    if ('client_name' in set && !set.client_name) throw new Error("The client's name can't be empty");
    for (const k of ['issue_date', 'due_date']) {
      if (k in input) {
        if (!isDate(input[k])) throw new Error('Check the dates');
        set[k] = input[k];
      }
    }
    if ('items' in input) {
      const items = cleanItems(input.items);
      set.items = JSON.stringify(items);
      set.total_pence = items.reduce((a, i) => a + i.pence, 0);
    }
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
  const cols = Object.keys(set);
  if (cols.length) {
    await db.prepare(`UPDATE invoices SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...cols.map((k) => set[k]), now(), inv.id).run();
    await logActivity(db, `Invoice ${inv.number} edited`);
  }
  return c.json({ ok: true });
});

// Send it. With Gmail connected the app emails it (PDF attached); otherwise you send it
// yourself (share/email/PDF) and this just records that it's gone.
app.post('/:id{[0-9]+}/send', async (c) => {
  const db = c.env.DB;
  const inv = await load(c);
  if (!inv) return c.json({ error: 'Invoice not found' }, 404);
  const { method = 'email', pdf } = (await c.req.json().catch(() => null)) || {};
  const origin = new URL(c.req.url).origin;
  const link = `${origin}/i/${inv.token}`;
  let emailed = false;
  if (method === 'email') {
    if (!emailReady(c.env)) return c.json({ error: 'Email is not connected yet' }, 400);
    if (!inv.client_email) return c.json({ error: "Add the client's email address first" }, 400);
    const [emails, business, booking] = await Promise.all([
      getSetting(db, 'emails'), getSetting(db, 'business'),
      inv.booking_id ? db.prepare('SELECT event_type FROM bookings WHERE id = ?').bind(inv.booking_id).first() : null,
    ]);
    const vars = templateVars(inv, { djName: business.djName, link, eventLabel: booking?.event_type && `your ${booking.event_type.toLowerCase()}` });
    const attachments = typeof pdf === 'string' && pdf.length < 2_000_000
      ? [{ filename: `${business.djName}-invoice-${inv.number}.pdf`, content: pdf, mimeType: 'application/pdf' }] : [];
    try {
      await sendMail(c.env, { to: inv.client_email, toName: inv.client_name, subject: fill(emails.invoiceSubject, vars), text: fill(emails.invoiceBody, vars), attachments });
    } catch (err) {
      return c.json({ error: `Couldn't send the email: ${err.message}` }, 502);
    }
    emailed = true;
  }
  const first = inv.status === 'draft';
  await db.prepare(`UPDATE invoices SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
    sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?`).bind(now(), now(), inv.id).run();
  await logActivity(db, `Invoice ${inv.number} ${emailed ? 'emailed' : first ? 'sent' : 'shared again'}`, `${inv.client_name}${emailed ? ` (${inv.client_email})` : ''}`);
  return c.json({ ok: true, emailed, link });
});

app.post('/:id{[0-9]+}/paid', async (c) => {
  const db = c.env.DB;
  const inv = await load(c);
  if (!inv) return c.json({ error: 'Invoice not found' }, 404);
  const { paid = true, date } = (await c.req.json().catch(() => null)) || {};
  if (paid) {
    const on = isDate(date) ? date : todayUK();
    await db.prepare(`UPDATE invoices SET status = 'paid', paid_at = ?, sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?`)
      .bind(on, now(), now(), inv.id).run();
    // Paid for a gig that's happened: the booking is done.
    if (inv.booking_id) {
      await db.prepare(`UPDATE bookings SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'confirmed' AND event_date < ?`)
        .bind(now(), inv.booking_id, todayUK()).run();
    }
    await logActivity(db, `Invoice ${inv.number} marked paid`, `${inv.client_name}: £${(inv.total_pence / 100).toFixed(2)}`);
  } else {
    await db.prepare(`UPDATE invoices SET status = CASE WHEN sent_at IS NULL THEN 'draft' ELSE 'sent' END, paid_at = NULL, updated_at = ? WHERE id = ?`)
      .bind(now(), inv.id).run();
    await logActivity(db, `Invoice ${inv.number} marked unpaid`, inv.client_name);
  }
  return c.json({ ok: true });
});

app.post('/:id{[0-9]+}/chasing', async (c) => {
  const db = c.env.DB;
  const inv = await load(c);
  if (!inv) return c.json({ error: 'Invoice not found' }, 404);
  const { paused } = (await c.req.json().catch(() => null)) || {};
  await db.prepare('UPDATE invoices SET chasing_paused = ?, updated_at = ? WHERE id = ?').bind(paused ? 1 : 0, now(), inv.id).run();
  await logActivity(db, `Reminders ${paused ? 'paused' : 'resumed'} for ${inv.number}`, inv.client_name);
  return c.json({ ok: true });
});

app.delete('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const inv = await load(c);
  if (!inv) return c.json({ error: 'Invoice not found' }, 404);
  await db.batch([
    db.prepare('DELETE FROM invoice_reminders WHERE invoice_id = ?').bind(inv.id),
    db.prepare('DELETE FROM invoices WHERE id = ?').bind(inv.id),
  ]);
  await logActivity(db, `Invoice ${inv.number} deleted`, `${inv.client_name}: £${(inv.total_pence / 100).toFixed(2)}`);
  return c.json({ ok: true });
});

// Check the Gmail connection by emailing yourself.
app.post('/test-email', async (c) => {
  const business = await getSetting(c.env.DB, 'business');
  try {
    await sendMail(c.env, { to: business.email, subject: 'DJ HQ email test ✅', text: 'Your DJ HQ app can send emails. Nice one!' });
  } catch (err) {
    return c.json({ error: `That didn't work: ${err.message}` }, 400);
  }
  return c.json({ ok: true });
});

export default app;
