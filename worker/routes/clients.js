// Client profiles: everyone you've quoted, played for or invoiced.
import { Hono } from 'hono';
import { now, todayUK, logActivity, all } from '../db.js';
import { invoiceState } from '../invoice-logic.js';
import { linkClient } from '../clients.js';
import { createInvoice } from './invoices.js';

const app = new Hono();

const clean = (input) => {
  const out = {};
  for (const [k, max] of Object.entries({ name: 120, email: 200, phone: 40, address: 400, instagram: 60, notes: 4000 })) {
    if (k in input) out[k] = String(input[k] ?? '').trim().slice(0, max) || null;
  }
  if ('name' in out && !out.name) throw new Error("The client's name can't be empty");
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error('Check the email address');
  if (out.instagram) out.instagram = '@' + out.instagram.replace(/^@+/, '');
  return out;
};

// Everyone, most recently active first, with what they've paid and owe.
app.get('/', async (c) => {
  const rows = await all(c.env.DB.prepare(`SELECT c.id, c.name, c.email, c.phone,
      (SELECT COUNT(*) FROM bookings b WHERE b.client_id = c.id AND b.status IN ('confirmed', 'completed')) AS gigs,
      (SELECT COALESCE(SUM(total_pence), 0) FROM invoices i WHERE i.client_id = c.id AND i.status = 'paid')
        + (SELECT COALESCE(SUM(deposit_pence), 0) FROM bookings b WHERE b.client_id = c.id AND b.deposit_paid_at IS NOT NULL) AS paid_pence,
      (SELECT COALESCE(SUM(total_pence), 0) FROM invoices i WHERE i.client_id = c.id AND i.status = 'sent') AS owed_pence,
      MAX(c.updated_at,
        COALESCE((SELECT MAX(updated_at) FROM bookings b WHERE b.client_id = c.id), ''),
        COALESCE((SELECT MAX(updated_at) FROM invoices i WHERE i.client_id = c.id), '')) AS last_active
    FROM clients c ORDER BY last_active DESC LIMIT 1000`));
  return c.json(rows);
});

app.post('/', async (c) => {
  let input;
  try {
    input = clean((await c.req.json().catch(() => null)) || {});
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
  if (!input.name) return c.json({ error: "Add the client's name" }, 400);
  const id = await linkClient(c.env.DB, input);
  await logActivity(c.env.DB, 'Client added', input.name);
  return c.json({ id });
});

async function load(c) {
  return c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(Number(c.req.param('id'))).first();
}

app.get('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const client = await load(c);
  if (!client) return c.json({ error: 'Client not found' }, 404);
  const today = todayUK();
  const [invoices, bookings] = await db.batch([
    db.prepare(`SELECT id, number, issue_date, due_date, total_pence, status, sent_at, paid_at, viewed_at
      FROM invoices WHERE client_id = ? ORDER BY issue_date DESC, id DESC`).bind(client.id),
    db.prepare(`SELECT id, status, event_type, event_date, venue_name, price_pence, extras, deposit_pence, deposit_paid_at, gig_notes
      FROM bookings WHERE client_id = ? ORDER BY event_date DESC`).bind(client.id),
  ]).then((r) => r.map((x) => x.results));
  const sum = (list) => list.reduce((a, i) => a + i.total_pence, 0);
  const inv = invoices.map((i) => ({ ...i, state: invoiceState(i, today) }));
  return c.json({
    ...client,
    invoices: inv,
    bookings,
    stats: {
      paidPence: sum(inv.filter((i) => i.state === 'paid')) + bookings.reduce((a, b) => a + (b.deposit_paid_at ? b.deposit_pence || 0 : 0), 0),
      owedPence: sum(inv.filter((i) => ['sent', 'viewed', 'overdue'].includes(i.state))),
      overduePence: sum(inv.filter((i) => i.state === 'overdue')),
      gigs: bookings.filter((b) => ['confirmed', 'completed'].includes(b.status)).length,
    },
  });
});

app.patch('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const client = await load(c);
  if (!client) return c.json({ error: 'Client not found' }, 404);
  let changes;
  try {
    changes = clean((await c.req.json().catch(() => null)) || {});
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
  const cols = Object.keys(changes);
  if (cols.length) {
    await db.prepare(`UPDATE clients SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...cols.map((k) => changes[k]), now(), client.id).run();
    await logActivity(db, 'Client details edited', changes.name || client.name);
  }
  return c.json({ ok: true });
});

// New invoice for a repeat client: their details, plus the lines from their last invoice.
app.post('/:id{[0-9]+}/invoice', async (c) => {
  const db = c.env.DB;
  const client = await load(c);
  if (!client) return c.json({ error: 'Client not found' }, 404);
  const last = await db.prepare('SELECT items FROM invoices WHERE client_id = ? ORDER BY issue_date DESC, id DESC LIMIT 1')
    .bind(client.id).first();
  // Drop the old gig date from line descriptions, e.g. "... (11 Oct 2026)".
  const items = (last ? JSON.parse(last.items || '[]') : [])
    .map((i) => ({ ...i, description: i.description.replace(/\s*\(\d{1,2} \w{3,4} \d{4}\)$/, '') }));
  const id = await createInvoice(db, {
    client_id: client.id, client_name: client.name, client_email: client.email, client_address: client.address,
    items: items.length ? items : [{ description: 'DJ performance', pence: 0 }],
  });
  return c.json({ id, copiedFromLast: Boolean(items.length) });
});

app.delete('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const client = await load(c);
  if (!client) return c.json({ error: 'Client not found' }, 404);
  // Their bookings and invoices are kept; they just stop being linked to a profile.
  await db.batch([
    db.prepare('UPDATE bookings SET client_id = NULL WHERE client_id = ?').bind(client.id),
    db.prepare('UPDATE invoices SET client_id = NULL WHERE client_id = ?').bind(client.id),
    db.prepare('DELETE FROM clients WHERE id = ?').bind(client.id),
  ]);
  await logActivity(db, 'Client profile deleted', client.name);
  return c.json({ ok: true });
});

export default app;
