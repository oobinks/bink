// The app's server, running on Cloudflare Workers.
// - /api/*  : your data (locked behind Cloudflare Access, see auth.js)
// - anything else: the app's screens, served by Cloudflare from dist/
// - scheduled(): background jobs (nightly backup, morning payment reminders, hourly clip reminders)
import { Hono } from 'hono';
import { ensureSchema } from './db.js';
import { requireAuth, authRoutes } from './auth.js';
import { runBackup } from './backup.js';
import dashboard from './routes/dashboard.js';
import settings from './routes/settings.js';
import ideas from './routes/ideas.js';
import bookings from './routes/bookings.js';
import invoices from './routes/invoices.js';
import clients from './routes/clients.js';
import afterGig, { afterGigNudges } from './routes/after-gig.js';
import clips, { cleanStaleUploads } from './routes/clips.js';
import { clipReminders } from './content.js';
import { runReminders } from './reminders.js';
import { emailReady, senderAddress } from './mail.js';
import publicRoutes, { calendarFeed, calendarToken } from './routes/public.js';
import { getVapid, saveSubscription, notify } from './push.js';
import { todayUK, now, logActivity } from './db.js';
import { getSetting, setSetting } from './settings.js';

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
// Scheduled jobs don't know the app's web address, so remember it when you use the app.
let originSaved = false;
app.use('/api/*', async (c, next) => {
  const origin = new URL(c.req.url).origin;
  if (!originSaved && origin.startsWith('https://')) {
    const site = await getSetting(c.env.DB, 'site');
    if (site?.origin !== origin) await setSetting(c.env.DB, 'site', { origin });
    originSaved = true;
  }
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
app.route('/api/invoices', invoices);
app.route('/api/clients', clients);
app.route('/api/after-gig', afterGig);
app.route('/api/clips', clips);
app.get('/api/email-status', async (c) => c.json({ ready: emailReady(c.env), from: await senderAddress(c.env) }));

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
    if (event.cron === '0 * * * *') {
      // Every hour: "time to post" reminders for scheduled clips.
      ctx.waitUntil(clipReminders(env));
      return;
    }
    if (event.cron === '0 9 * * *') {
      // Morning: payment reminders. Links in emails need the app's address, saved on each visit.
      const site = await getSetting(env.DB, 'site');
      ctx.waitUntil(Promise.all([runReminders(env, site?.origin || ''), afterGigNudges(env)]));
      return;
    }
    ctx.waitUntil((async () => {
      // Gigs whose date has passed move from Confirmed to Completed.
      const done = await env.DB.prepare(`UPDATE bookings SET status = 'completed', updated_at = ?
        WHERE status = 'confirmed' AND event_date < ?`).bind(now(), todayUK()).run();
      if (done.meta.changes) await logActivity(env.DB, 'Past gigs marked completed', `${done.meta.changes} gig(s)`);
      await cleanStaleUploads(env);
      await runBackup(env);
    })());
  },
};
