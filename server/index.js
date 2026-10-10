import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { authRoutes, requireAuth } from './auth.js';
import { startScheduler } from './scheduler.js';
import { loadSampleData } from './sample-data.js';
import { getSetting, setSetting } from './settings.js';
import dashboard from './routes/dashboard.js';
import settings from './routes/settings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4321);
// Only listen on this Mac. Your phone reaches it through Tailscale, which
// forwards to this port — nobody on the same Wi-Fi can get in directly.
const HOST = process.env.HOST || '127.0.0.1';

// First ever start: load the sample data so there's something to look at.
if (!getSetting('initialised')) {
  loadSampleData();
  setSetting('initialised', { at: new Date().toISOString() });
}

export const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

authRoutes(app);
app.use('/api/dashboard', requireAuth, dashboard);
app.use('/api/settings', requireAuth, settings);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// The app itself (built into dist/ by `npm run build`).
const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, HOST, () => {
    console.log(`ctrinn DJ HQ running at http://localhost:${PORT}`);
    if (!fs.existsSync(DIST)) console.log('Note: run `npm run build` first to create the app screens.');
  });
  startScheduler();
  const shutdown = () => { db.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
