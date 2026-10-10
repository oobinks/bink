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
app.use('/api/*', requireAuth());

app.get('/api/me', (c) => c.json({ email: c.get('user').email }));
app.route('/api/dashboard', dashboard);
app.route('/api/settings', settings);
app.route('/api/ideas', ideas);
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    await ensureSchema(env.DB);
    ctx.waitUntil(runBackup(env));
  },
};
