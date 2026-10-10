import { Router } from 'express';
import { db, todayUK, addDays } from '../db.js';

const router = Router();

// An invoice is overdue when it's been sent, not paid, and the due date has passed.
export function invoiceState(inv, today = todayUK()) {
  if (inv.status === 'sent' && inv.due_date < today) return 'overdue';
  return inv.status;
}

router.get('/', (req, res) => {
  const today = todayUK();
  const in30 = addDays(today, 30);

  const upcomingGigs = db.prepare(`
    SELECT id, client_name, event_date, start_time, end_time, venue_name, event_type, price_pence
    FROM bookings WHERE status = 'confirmed' AND event_date >= ?
    ORDER BY event_date, start_time LIMIT 6`).all(today);

  const newEnquiries = db.prepare(`
    SELECT id, client_name, event_date, venue_name, event_type, budget_pence, created_at, seen_at
    FROM bookings WHERE status = 'new' ORDER BY created_at DESC LIMIT 6`).all();

  const unpaid = db.prepare(`
    SELECT id, number, client_name, due_date, total_pence, status, chasing_paused
    FROM invoices WHERE status = 'sent' ORDER BY due_date`).all()
    .map((inv) => ({ ...inv, state: invoiceState(inv, today) }));

  const clipCounts = db.prepare(`
    SELECT
      SUM(status = 'starred') AS unscheduled,
      SUM(status = 'scheduled') AS scheduled,
      SUM(status = 'scheduled' AND substr(scheduled_at, 1, 10) = ?) AS today
    FROM clips`).get(today);

  // "Needs your attention today" — the most urgent things first.
  const attention = [];
  const gigsToday = upcomingGigs.filter((g) => g.event_date === today);
  for (const g of gigsToday) {
    attention.push({ kind: 'gig', tone: 'gold', title: `Gig tonight at ${g.venue_name || 'TBC'}`,
      detail: `${g.start_time || ''}${g.end_time ? '–' + g.end_time : ''} · ${g.client_name}`, link: `/bookings/${g.id}` });
  }
  const unseen = newEnquiries.filter((e) => !e.seen_at);
  if (unseen.length) {
    attention.push({ kind: 'enquiry', tone: 'pink',
      title: `${unseen.length} new ${unseen.length === 1 ? 'enquiry' : 'enquiries'} to reply to`,
      detail: unseen.map((e) => e.client_name).join(', '), link: '/bookings' });
  }
  const overdue = unpaid.filter((i) => i.state === 'overdue');
  if (overdue.length) {
    const sum = overdue.reduce((a, i) => a + i.total_pence, 0);
    attention.push({ kind: 'overdue', tone: 'red',
      title: `${overdue.length} overdue ${overdue.length === 1 ? 'invoice' : 'invoices'}`,
      detail: `£${(sum / 100).toFixed(2)} outstanding`, link: '/invoices' });
  }
  const dueSoon = unpaid.filter((i) => i.state === 'sent' && i.due_date <= addDays(today, 2));
  if (dueSoon.length) {
    attention.push({ kind: 'due', tone: 'gold',
      title: `${dueSoon.length} ${dueSoon.length === 1 ? 'invoice' : 'invoices'} due in the next 2 days`,
      detail: dueSoon.map((i) => i.client_name).join(', '), link: '/invoices' });
  }
  // Gigs that have happened but haven't been invoiced yet.
  const toInvoice = db.prepare(`
    SELECT b.id, b.client_name, b.event_date FROM bookings b
    WHERE b.status IN ('confirmed', 'completed') AND b.event_date < ?
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id)
    ORDER BY b.event_date`).all(today);
  if (toInvoice.length) {
    attention.push({ kind: 'invoice', tone: 'violet',
      title: `${toInvoice.length} past ${toInvoice.length === 1 ? 'gig needs' : 'gigs need'} an invoice`,
      detail: toInvoice.map((b) => b.client_name).join(', '), link: '/invoices' });
  }
  if (clipCounts.today) {
    attention.push({ kind: 'clips', tone: 'violet', title: `${clipCounts.today} ${clipCounts.today === 1 ? 'clip' : 'clips'} to post today`,
      detail: 'You will get a reminder at each posting time', link: '/content' });
  }
  if (clipCounts.unscheduled) {
    attention.push({ kind: 'clips', tone: 'muted', title: `${clipCounts.unscheduled} starred ${clipCounts.unscheduled === 1 ? 'clip' : 'clips'} not scheduled`,
      detail: 'Tap to spread them across the coming week', link: '/content' });
  }

  const monthStart = today.slice(0, 8) + '01';
  const earnedThisMonth = db.prepare(
    `SELECT COALESCE(SUM(total_pence), 0) AS v FROM invoices WHERE status = 'paid' AND substr(paid_at, 1, 10) >= ?`
  ).get(monthStart).v;
  const gigsNext30 = db.prepare(
    `SELECT COUNT(*) AS v FROM bookings WHERE status = 'confirmed' AND event_date BETWEEN ? AND ?`
  ).get(today, in30).v;

  res.json({
    today,
    stats: {
      gigsNext30,
      owedPence: unpaid.reduce((a, i) => a + i.total_pence, 0),
      overduePence: overdue.reduce((a, i) => a + i.total_pence, 0),
      earnedThisMonthPence: earnedThisMonth,
    },
    attention,
    upcomingGigs,
    newEnquiries,
    unpaid,
    clips: { unscheduled: clipCounts.unscheduled || 0, scheduled: clipCounts.scheduled || 0 },
  });
});

export default router;
