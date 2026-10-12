import { Hono } from 'hono';
import { todayUK, addDays, all } from '../db.js';
import { unwrappedGigs } from './after-gig.js';

const app = new Hono();

// An invoice is overdue when it's been sent, not paid, and the due date has passed.
export function invoiceState(inv, today = todayUK()) {
  if (inv.status === 'sent' && inv.due_date < today) return 'overdue';
  return inv.status;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

app.get('/', async (c) => {
  const db = c.env.DB;
  const today = todayUK();
  const monthStart = today.slice(0, 8) + '01';

  let [upcomingGigs, newEnquiries, unpaidRows, toInvoice, clipCounts, stats] = await db.batch([
    db.prepare(`SELECT id, client_name, event_date, start_time, end_time, venue_name, event_type, price_pence
      FROM bookings WHERE status = 'confirmed' AND event_date >= ? ORDER BY event_date, start_time LIMIT 6`).bind(today),
    db.prepare(`SELECT id, client_name, event_date, venue_name, event_type, budget_pence, created_at, seen_at
      FROM bookings WHERE status = 'new' ORDER BY created_at DESC LIMIT 6`),
    db.prepare(`SELECT id, number, client_name, due_date, total_pence, status, chasing_paused
      FROM invoices WHERE status = 'sent' ORDER BY due_date`),
    // Gigs that have happened but haven't been invoiced yet.
    db.prepare(`SELECT b.id, b.client_name FROM bookings b
      WHERE b.status IN ('confirmed', 'completed') AND b.event_date < ?
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id) ORDER BY b.event_date`).bind(today),
    db.prepare(`SELECT COALESCE(SUM(status = 'starred'), 0) AS unscheduled, COALESCE(SUM(status = 'scheduled'), 0) AS scheduled,
      COALESCE(SUM(status = 'scheduled' AND substr(scheduled_at, 1, 10) = ?), 0) AS today FROM clips`).bind(today),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed' AND event_date BETWEEN ?1 AND ?2) AS gigsNext30,
      (SELECT COALESCE(SUM(total_pence), 0) FROM invoices WHERE status = 'paid' AND substr(paid_at, 1, 10) >= ?3)
        + (SELECT COALESCE(SUM(deposit_pence), 0) FROM bookings WHERE substr(deposit_paid_at, 1, 10) >= ?3) AS earned`)
      .bind(today, addDays(today, 30), monthStart),
  ]).then((rs) => rs.map((r) => r.results));

  const unpaid = unpaidRows.map((inv) => ({ ...inv, state: invoiceState(inv, today) }));
  const clips = clipCounts[0];
  const overdue = unpaid.filter((i) => i.state === 'overdue');
  const sum = (list) => list.reduce((a, i) => a + i.total_pence, 0);

  // "Needs your attention" — the most urgent things first.
  const attention = [];
  const toWrap = await unwrappedGigs(db, today);
  for (const g of toWrap.slice(0, 3)) {
    attention.push({ kind: 'aftergig', tone: 'pink', title: `How was ${g.venue_name || g.client_name}? Wrap it up`,
      detail: 'Get paid, add clips and notes', link: `/after/${g.id}` });
  }
  for (const g of upcomingGigs.filter((g) => g.event_date === today)) {
    attention.push({ kind: 'gig', tone: 'gold', title: `Gig tonight at ${g.venue_name || 'TBC'}`,
      detail: `${g.start_time || ''}${g.end_time ? '–' + g.end_time : ''} · ${g.client_name}`, link: `/bookings/${g.id}` });
  }
  const awaiting = await db.prepare(`SELECT id, client_name, deposit_pence FROM bookings
    WHERE status = 'quoted' AND quote_accepted_at IS NOT NULL AND deposit_paid_at IS NULL AND deposit_pence > 0
    ORDER BY event_date`).all().then((r) => r.results);
  if (awaiting.length) {
    attention.push({ kind: 'deposit', tone: 'gold',
      title: `${plural(awaiting.length, 'deposit', 'deposits')} to look out for`,
      detail: awaiting.map((a) => `${a.client_name} £${(a.deposit_pence / 100).toFixed(0)}`).join(', '),
      link: awaiting.length === 1 ? `/bookings/${awaiting[0].id}` : '/bookings?tab=quoted' });
  }
  const unseen = newEnquiries.filter((e) => !e.seen_at);
  if (unseen.length) {
    attention.push({ kind: 'enquiry', tone: 'pink', title: `${plural(unseen.length, 'new enquiry', 'new enquiries')} to reply to`,
      detail: unseen.map((e) => e.client_name).join(', '), link: '/bookings' });
  }
  if (overdue.length) {
    attention.push({ kind: 'overdue', tone: 'red', title: plural(overdue.length, 'overdue invoice', 'overdue invoices'),
      detail: `£${(sum(overdue) / 100).toFixed(2)} outstanding`, link: '/invoices' });
  }
  const dueSoon = unpaid.filter((i) => i.state === 'sent' && i.due_date <= addDays(today, 2));
  if (dueSoon.length) {
    attention.push({ kind: 'due', tone: 'gold', title: `${plural(dueSoon.length, 'invoice', 'invoices')} due in the next 2 days`,
      detail: dueSoon.map((i) => i.client_name).join(', '), link: '/invoices' });
  }
  const wrapIds = new Set(toWrap.map((g) => g.id));
  toInvoice = toInvoice.filter((b) => !wrapIds.has(b.id));
  if (toInvoice.length) {
    attention.push({ kind: 'invoice', tone: 'violet',
      title: `${toInvoice.length} past ${toInvoice.length === 1 ? 'gig needs' : 'gigs need'} an invoice`,
      detail: toInvoice.map((b) => b.client_name).join(', '), link: toInvoice.length === 1 ? `/bookings/${toInvoice[0].id}` : '/bookings?tab=completed' });
  }
  if (clips.today) {
    attention.push({ kind: 'clips', tone: 'violet', title: `${plural(clips.today, 'clip', 'clips')} to post today`,
      detail: 'You will get a reminder at each posting time', link: '/content' });
  }
  if (clips.unscheduled) {
    attention.push({ kind: 'clips', tone: 'muted', title: `${plural(clips.unscheduled, 'starred clip', 'starred clips')} not scheduled`,
      detail: 'Tap to spread them across the coming week', link: '/content' });
  }

  return c.json({
    today,
    stats: {
      gigsNext30: stats[0].gigsNext30,
      owedPence: sum(unpaid),
      overduePence: sum(overdue),
      earnedThisMonthPence: stats[0].earned,
    },
    attention,
    upcomingGigs,
    newEnquiries,
    unpaid,
    clips: { unscheduled: clips.unscheduled, scheduled: clips.scheduled },
  });
});

export default app;
