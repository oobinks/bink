// Analytics screen: income, gigs, gig types, busiest days, enquiries and clients for a period.
import { Hono } from 'hono';
import { todayUK, all } from '../db.js';
import { buildAnalytics } from '../analytics.js';

const app = new Hono();

app.get('/', async (c) => {
  const db = c.env.DB;
  const period = ['tax', '12m', 'all'].includes(c.req.query('period')) ? c.req.query('period') : '12m';
  const today = todayUK();
  const [payments, bookings, clips] = await db.batch([
    // Income = paid invoices + deposits (counted on the day they arrived), the same as the Money screen.
    db.prepare(`SELECT substr(paid_at, 1, 10) AS date, total_pence AS pence, client_name AS client FROM invoices
        WHERE status = 'paid' AND paid_at IS NOT NULL
      UNION ALL
      SELECT substr(deposit_paid_at, 1, 10), deposit_pence, client_name FROM bookings WHERE deposit_paid_at IS NOT NULL AND deposit_pence > 0`),
    db.prepare(`SELECT status, source, client_name, event_type, event_date, price_pence, extras, quote_sent_at, created_at FROM bookings`),
    db.prepare(`SELECT substr(posted_at, 1, 10) AS date FROM clips WHERE status = 'posted' AND posted_at IS NOT NULL`),
  ]).then((r) => r.map((x) => x.results));
  const range = buildAnalytics({ period, today, payments, bookings, clipsPosted: 0 });
  range.clipsPosted = clips.filter((x) => x.date >= range.from && x.date <= range.to).length;
  return c.json({ today, ...range });
});

export default app;
