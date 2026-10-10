// The app's server, running on Cloudflare Workers.
// - /api/*  : your data (locked behind Cloudflare Access, see auth.js)
// - anything else: the app's screens, served by Cloudflare from dist/
// - scheduled(): background jobs (nightly backup; later invoice chasing and clip reminders)
import { Hono } from 'hono';
import { ensureSchema } from './db.js';
import { requireAuth, authRoutes } from './auth.js';
import { runBackup } from './backup.js';
import dashboard from './routes/dashboard.js';
import settings from './routes/settings.js';
import ideas from './routes/ideas.js';
import bookings from './routes/bookings.js';
import publicRoutes, { calendarFeed, calendarToken } from './routes/public.js';
import { getVapid, saveSubscription, notify } from './push.js';
import { todayUK, now, logActivity } from './db.js';

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Cache-Control', 'no-store');
});

app.use('/api/*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});
authRoutes(app);
// Public: the booking form and quote links. Everything after this needs you logged in.
app.route('/api/public', publicRoutes);
app.use('/api/*', requireAuth());

app.get('/api/me', (c) => c.json({ email: c.get('user').email }));
app.route('/api/dashboard', dashboard);
app.route('/api/settings', settings);
app.route('/api/ideas', ideas);
app.route('/api/bookings', bookings);

// Phone notifications.
app.get('/api/push/key', async (c) => c.json({ publicKey: (await getVapid(c.env.DB)).publicKey }));
app.post('/api/push/subscribe', async (c) => {
  try {
    await saveSubscription(c.env.DB, await c.req.json(), c.req.header('user-agent'));
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
  return c.json({ ok: true });
});
app.post('/api/push/test', async (c) => {
  const sent = await notify(c.env, { title: 'Notifications are on 🪩', body: "You'll hear about new enquiries here.", url: '/' });
  return c.json({ sent });
});
app.get('/api/calendar-link', async (c) => c.json({ path: `/cal/${await calendarToken(c.env.DB)}.ics` }));
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Calendar feed for your phone's calendar app (private link, no login).
app.get('/cal/:file', async (c) => {
  await ensureSchema(c.env.DB);
  return calendarFeed(c);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    await ensureSchema(env.DB);
    ctx.waitUntil((async () => {
      // Gigs whose date has passed move from Confirmed to Completed.
      const done = await env.DB.prepare(`UPDATE bookings SET status = 'completed', updated_at = ?
        WHERE status = 'confirmed' AND event_date < ?`).bind(now(), todayUK()).run();
      if (done.meta.changes) await logActivity(env.DB, 'Past gigs marked completed', `${done.meta.changes} gig(s)`);
      await runBackup(env);
    })());
  },
};
