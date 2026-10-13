import { Hono } from 'hono';
import { now, todayUK, logActivity, all } from '../db.js';
import { STATUSES, cleanBooking, cleanExtras, quoteTotal } from '../booking-fields.js';
import { getSetting } from '../settings.js';
import { linkClient } from '../clients.js';

const app = new Hono();

const LIST_COLS = `id, status, kind, source, client_name, event_date, start_time, end_time, venue_name, event_type,
  budget_pence, price_pence, extras, seen_at, quote_sent_at, quote_accepted_at, deposit_pence, deposit_paid_at, created_at`;

const withTotal = (b) => ({ ...b, extras: JSON.parse(b.extras || '[]'), total_pence: quoteTotal(b) });

// Other confirmed gigs on the same day.
async function clashes(db, b) {
  if (!b.event_date) return [];
  return all(db.prepare(`SELECT id, client_name, venue_name, start_time, end_time FROM bookings
    WHERE status = 'confirmed' AND event_date = ? AND id != ?`).bind(b.event_date, b.id));
}

app.get('/', async (c) => {
  const db = c.env.DB;
  const status = c.req.query('status') || 'new';
  if (!STATUSES.includes(status)) return c.json({ error: 'Unknown status' }, 400);
  // Upcoming first for live bookings; most recent first for finished ones.
  const order = ['new', 'quoted', 'confirmed'].includes(status)
    ? (status === 'new' ? 'created_at DESC' : 'event_date ASC')
    : 'event_date DESC';
  const [rows, counts] = await db.batch([
    db.prepare(`SELECT ${LIST_COLS} FROM bookings WHERE status = ? ORDER BY ${order} LIMIT 200`).bind(status),
    db.prepare(`SELECT status, COUNT(*) AS n FROM bookings GROUP BY status`),
  ]);
  return c.json({
    bookings: rows.results.map(withTotal),
    counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])),
  });
});

// Month view: everything with a date in that month, except declined.
app.get('/calendar', async (c) => {
  const month = c.req.query('month') || '';
  if (!/^\d{4}-\d{2}$/.test(month)) return c.json({ error: 'Pick a month' }, 400);
  const rows = await all(c.env.DB.prepare(`SELECT ${LIST_COLS} FROM bookings
    WHERE event_date LIKE ? AND status != 'declined' ORDER BY event_date, start_time`).bind(`${month}-%`));
  return c.json(rows.map(withTotal));
});

// A client picked from your list: the booking takes their name and contact details.
async function pickedClient(db, input) {
  if (input.client_id === undefined || input.client_id === null || input.client_id === '') return null;
  const client = await db.prepare('SELECT id, name, email, phone FROM clients WHERE id = ?').bind(Number(input.client_id)).first();
  if (!client) throw new Error('Client not found');
  Object.assign(input, { client_name: client.name, client_email: client.email, client_phone: client.phone });
  return client.id;
}

// Add a booking by hand: a private party enquiry, or a club set (already agreed, so it starts confirmed with its fee).
app.post('/', async (c) => {
  const db = c.env.DB;
  const input = (await c.req.json().catch(() => null)) || {};
  const club = input.kind === 'club';
  let b;
  let clientId;
  try {
    clientId = await pickedClient(db, input);
    if (club && !input.client_name) input.client_name = input.venue_name;
    b = cleanBooking(input);
  } catch (err) {
    return c.json({ error: club && !input.venue_name ? 'Add the club or venue' : err.message }, 400);
  }
  let status = 'new';
  if (club) {
    const fee = Math.round(Number(input.price_pence));
    if (!Number.isFinite(fee) || fee < 0) return c.json({ error: 'Check the fee' }, 400);
    if (!b.event_date) return c.json({ error: 'Add the date' }, 400);
    Object.assign(b, { kind: 'club', price_pence: fee, deposit_pence: 0, event_type: b.event_type || 'Club set' });
    status = 'confirmed';
  }
  b.client_id = clientId ?? await linkClient(db, { name: b.client_name, email: b.client_email, phone: b.client_phone, instagram: b.instagram });
  const ts = now();
  const cols = Object.keys(b);
  const res = await db.prepare(`INSERT INTO bookings (${cols.join(', ')}, status, source, seen_at, created_at, updated_at)
    VALUES (${cols.map(() => '?').join(', ')}, ?, 'manual', ?, ?, ?)`).bind(...cols.map((k) => b[k]), status, ts, ts, ts).run();
  if (club) await logActivity(db, 'Club set added', `${b.venue_name || b.client_name}: ${b.event_date}, £${(b.price_pence / 100).toFixed(2)}`);
  else await logActivity(db, 'Enquiry added', b.client_name);
  return c.json({ id: res.meta.last_row_id });
});

async function load(c) {
  const id = Number(c.req.param('id'));
  return Number.isInteger(id) ? c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first() : null;
}

app.get('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  if (!b.seen_at) {
    b.seen_at = now();
    await db.prepare('UPDATE bookings SET seen_at = ? WHERE id = ?').bind(b.seen_at, b.id).run();
  }
  const [clash, invoice] = await Promise.all([
    clashes(db, b),
    db.prepare('SELECT id, number, status FROM invoices WHERE booking_id = ? ORDER BY id DESC LIMIT 1').bind(b.id).first(),
  ]);
  const { raw_form, answers, ...rest } = b;
  return c.json({ ...withTotal(rest), answers: answers ? JSON.parse(answers) : [], clashes: clash, invoice });
});

app.patch('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  let changes;
  try {
    const input = (await c.req.json().catch(() => null)) || {};
    const clientId = await pickedClient(db, input);
    changes = cleanBooking(input, { partial: true });
    if (clientId) changes.client_id = clientId;
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
  const cols = Object.keys(changes);
  if (cols.length) {
    await db.prepare(`UPDATE bookings SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...cols.map((k) => changes[k]), now(), b.id).run();
    await logActivity(db, 'Booking details edited', b.client_name);
  }
  return c.json({ ok: true });
});

const STATUS_LOG = {
  new: 'Moved back to New', quoted: 'Marked as quoted', confirmed: 'Booking confirmed',
  completed: 'Gig marked completed', declined: 'Booking declined',
};

app.post('/:id{[0-9]+}/status', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  const { status } = (await c.req.json().catch(() => null)) || {};
  if (!STATUSES.includes(status)) return c.json({ error: 'Unknown status' }, 400);
  await db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').bind(status, now(), b.id).run();
  await logActivity(db, STATUS_LOG[status], `${b.client_name}${b.event_date ? `: ${b.event_date}` : ''}`);
  return c.json({ ok: true, clashes: status === 'confirmed' ? await clashes(db, b) : [] });
});

// Save the price and extras.
app.put('/:id{[0-9]+}/quote', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  const input = (await c.req.json().catch(() => null)) || {};
  const price = Math.round(Number(input.price_pence));
  if (!Number.isFinite(price) || price < 0) return c.json({ error: 'Check the price' }, 400);
  let extras;
  try {
    extras = cleanExtras(input.extras);
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
  const miles = input.travel_miles === '' || input.travel_miles == null ? null : Math.round(Number(input.travel_miles));
  const message = String(input.quote_message ?? '').trim().slice(0, 2000) || null;
  const total = price + extras.reduce((a, e) => a + e.pence, 0);
  let deposit = b.deposit_pence ?? (await getSetting(db, 'pricing')).depositPence;
  if ('deposit_pence' in input) {
    deposit = Math.round(Number(input.deposit_pence));
    if (!Number.isFinite(deposit) || deposit < 0) return c.json({ error: 'Check the deposit' }, 400);
  }
  if (deposit > total) return c.json({ error: "The deposit can't be more than the total" }, 400);
  await db.prepare(`UPDATE bookings SET price_pence = ?, extras = ?, travel_miles = ?, quote_message = ?, deposit_pence = ?, updated_at = ? WHERE id = ?`)
    .bind(price, JSON.stringify(extras), Number.isFinite(miles) ? miles : null, message, deposit, now(), b.id).run();
  return c.json({ ok: true, total_pence: total, deposit_pence: deposit });
});

// Make the quote's private link and mark it as sent.
app.post('/:id{[0-9]+}/quote/send', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  if (!b.price_pence) return c.json({ error: 'Set a price first' }, 400);
  let token = b.quote_token;
  if (!token) {
    token = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  const status = b.status === 'new' ? 'quoted' : b.status;
  const deposit = Math.min(b.deposit_pence ?? (await getSetting(db, 'pricing')).depositPence, quoteTotal(b));
  await db.prepare(`UPDATE bookings SET quote_token = ?, quote_sent_at = COALESCE(quote_sent_at, ?), status = ?, deposit_pence = ?, updated_at = ? WHERE id = ?`)
    .bind(token, now(), status, deposit, now(), b.id).run();
  if (!b.quote_sent_at) await logActivity(db, 'Quote sent', `${b.client_name}: £${(quoteTotal(b) / 100).toFixed(2)}`);
  const business = await getSetting(db, 'business');
  return c.json({ path: `/q/${token}`, status, djName: business.djName });
});

// The client's deposit has arrived: that confirms the booking.
app.post('/:id{[0-9]+}/deposit', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  const { paid = true, date } = (await c.req.json().catch(() => null)) || {};
  if (!paid) {
    await db.prepare('UPDATE bookings SET deposit_paid_at = NULL, updated_at = ? WHERE id = ?').bind(now(), b.id).run();
    await logActivity(db, 'Deposit marked as not received', b.client_name);
    return c.json({ ok: true, clashes: [] });
  }
  const on = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : todayUK();
  const status = ['new', 'quoted'].includes(b.status) ? 'confirmed' : b.status;
  await db.prepare('UPDATE bookings SET deposit_paid_at = ?, status = ?, updated_at = ? WHERE id = ?').bind(on, status, now(), b.id).run();
  await logActivity(db, 'Deposit received, booking confirmed', `${b.client_name}: £${((b.deposit_pence || 0) / 100).toFixed(2)}`);
  return c.json({ ok: true, clashes: status === 'confirmed' ? await clashes(db, b) : [] });
});

app.delete('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  await db.batch([
    db.prepare('UPDATE invoices SET booking_id = NULL WHERE booking_id = ?').bind(b.id),
    db.prepare('UPDATE clips SET booking_id = NULL WHERE booking_id = ?').bind(b.id),
    db.prepare('DELETE FROM bookings WHERE id = ?').bind(b.id),
  ]);
  await logActivity(db, 'Booking deleted', `${b.client_name}${b.event_date ? `: ${b.event_date}` : ''}`);
  return c.json({ ok: true });
});

export default app;
