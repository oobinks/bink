// "After the gig": the morning after, wrap a gig up in one screen —
// get paid (balance on the night, or send the invoice), clips, notes, done.
import { Hono } from 'hono';
import { now, todayUK, addDays, logActivity, all } from '../db.js';
import { invoiceFromBooking } from './invoices.js';
import { notify } from '../push.js';

const app = new Hono();
export const WINDOW_DAYS = 14; // gigs older than this stop nagging

// Gigs that have happened but haven't been wrapped up yet.
export function unwrappedGigs(db, today = todayUK()) {
  return all(db.prepare(`SELECT b.id, b.client_name, b.venue_name, b.event_type, b.event_date,
      (SELECT id FROM invoices i WHERE i.booking_id = b.id ORDER BY id DESC LIMIT 1) AS invoice_id
    FROM bookings b
    WHERE b.status IN ('confirmed', 'completed') AND b.wrapped_at IS NULL
      AND b.event_date < ? AND b.event_date >= ?
    ORDER BY b.event_date DESC`).bind(today, addDays(today, -WINDOW_DAYS)));
}

app.get('/', async (c) => c.json(await unwrappedGigs(c.env.DB)));

async function load(c) {
  return c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(Number(c.req.param('id'))).first();
}

// They paid the balance on the night: invoice made and marked paid (dated the night of the gig).
app.post('/:id{[0-9]+}/paid-on-night', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  const { id } = await invoiceFromBooking(db, b.id);
  const paidOn = b.event_date && b.event_date <= todayUK() ? b.event_date : todayUK();
  const inv = await db.prepare('SELECT number, total_pence FROM invoices WHERE id = ?').bind(id).first();
  await db.batch([
    db.prepare(`UPDATE invoices SET status = 'paid', paid_at = ?, sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?`)
      .bind(paidOn, now(), now(), id),
    db.prepare(`UPDATE bookings SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'confirmed'`).bind(now(), b.id),
  ]);
  await logActivity(db, `Balance paid on the night: ${inv.number}`, `${b.client_name}: £${(inv.total_pence / 100).toFixed(2)}`);
  return c.json({ ok: true, invoiceId: id });
});

// All done with this gig.
app.post('/:id{[0-9]+}/wrap', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  const { notes } = (await c.req.json().catch(() => null)) || {};
  const text = String(notes ?? '').trim().slice(0, 4000) || null;
  await db.prepare(`UPDATE bookings SET wrapped_at = ?, gig_notes = COALESCE(?, gig_notes),
      status = CASE WHEN status = 'confirmed' THEN 'completed' ELSE status END, updated_at = ? WHERE id = ?`)
    .bind(now(), text, now(), b.id).run();
  await logActivity(db, 'Gig wrapped up', `${b.venue_name || b.client_name}: ${b.event_date}`);
  return c.json({ ok: true });
});

// Save notes without finishing (e.g. typed on the way home).
app.post('/:id{[0-9]+}/notes', async (c) => {
  const db = c.env.DB;
  const b = await load(c);
  if (!b) return c.json({ error: 'Booking not found' }, 404);
  const { notes } = (await c.req.json().catch(() => null)) || {};
  await db.prepare('UPDATE bookings SET gig_notes = ?, updated_at = ? WHERE id = ?')
    .bind(String(notes ?? '').trim().slice(0, 4000) || null, now(), b.id).run();
  return c.json({ ok: true });
});

// Morning after: a nudge for last night's gig(s). Runs with the morning job.
export async function afterGigNudges(env) {
  const yesterday = addDays(todayUK(), -1);
  const gigs = await all(env.DB.prepare(`SELECT id, client_name, venue_name FROM bookings
    WHERE event_date = ? AND status IN ('confirmed', 'completed') AND wrapped_at IS NULL AND is_sample = 0`).bind(yesterday));
  for (const g of gigs) {
    await notify(env, {
      title: `🎧 How was ${g.venue_name || g.client_name}?`,
      body: 'Tap to wrap it up: get paid, add clips and notes.',
      url: `/after/${g.id}`,
    });
  }
  return gigs.length;
}

export default app;
