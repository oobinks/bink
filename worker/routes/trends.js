// Trends screen: notes about what's changing, worked out fresh from your data each time.
import { Hono } from 'hono';
import { todayUK } from '../db.js';
import { buildTrends } from '../trends.js';

const app = new Hono();

app.get('/', async (c) => {
  const db = c.env.DB;
  const today = todayUK();
  const [payments, bookings, invoices, clips] = await db.batch([
    // Income = paid invoices + deposits (as on the Money and Analytics screens).
    db.prepare(`SELECT substr(paid_at, 1, 10) AS date, total_pence AS pence FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL
      UNION ALL SELECT substr(deposit_paid_at, 1, 10), deposit_pence FROM bookings WHERE deposit_paid_at IS NOT NULL AND deposit_pence > 0`),
    db.prepare(`SELECT status, kind, client_id, client_name, event_type, event_date, price_pence, extras, created_at FROM bookings`),
    db.prepare(`SELECT client_name, status, sent_at, paid_at, due_date FROM invoices`),
    db.prepare(`SELECT status, posted_at FROM clips WHERE status != 'uploading'`),
  ]).then((r) => r.map((x) => x.results));
  return c.json({ today, trends: buildTrends({ today, payments, bookings, invoices, clips }) });
});

export default app;
