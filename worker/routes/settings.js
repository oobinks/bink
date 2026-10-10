import { Hono } from 'hono';
import { DEFAULT_SETTINGS, getAllSettings, getSetting, setSetting, cleanSection } from '../settings.js';
import { runBackup, listBackups, snapshot } from '../backup.js';
import { loadSampleData, clearSampleData, hasSampleData } from '../sample-data.js';
import { logActivity, all } from '../db.js';

const app = new Hono();

const LABELS = { business: 'Your details', bank: 'Bank details', invoicing: 'Invoicing settings' };

app.get('/', async (c) => {
  const db = c.env.DB;
  return c.json({ ...(await getAllSettings(db)), meta: { hasSampleData: await hasSampleData(db), user: c.get('user').email } });
});

app.put('/:section', async (c) => {
  const section = c.req.param('section');
  if (!(section in DEFAULT_SETTINGS) || section === 'backups') return c.json({ error: 'Unknown section' }, 404);
  const db = c.env.DB;
  try {
    const value = cleanSection(section, (await c.req.json().catch(() => ({}))) || {}, await getSetting(db, section));
    await setSetting(db, section, value);
    await logActivity(db, `${LABELS[section]} updated`);
    return c.json(value);
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
});

app.get('/backups', async (c) => c.json(await listBackups(c.env)));

app.post('/backup-now', async (c) => {
  const result = await runBackup(c.env);
  return c.json(result, result.ok ? 200 : 500);
});

app.get('/backups/:key', async (c) => {
  const key = c.req.param('key');
  if (!key.startsWith('backup:')) return c.json({ error: 'Not found' }, 404);
  const body = await c.env.BACKUPS.get(key);
  if (!body) return c.json({ error: 'Not found' }, 404);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="ctrinn-backup-${key.slice(7, 17)}.json"`,
    },
  });
});

// Everything as data. The app turns this into a zip of spreadsheets on your device.
app.get('/export', async (c) => c.json(await snapshot(c.env.DB)));

app.get('/activity', async (c) => {
  const rows = await all(c.env.DB.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 100'));
  return c.json(rows);
});

app.post('/sample-data', async (c) => {
  const db = c.env.DB;
  const { action } = await c.req.json().catch(() => ({}));
  if (action === 'clear') {
    await clearSampleData(db);
    await logActivity(db, 'Sample data removed');
  } else if (!(await hasSampleData(db))) {
    await loadSampleData(db);
    await logActivity(db, 'Sample data loaded');
  }
  return c.json({ hasSampleData: await hasSampleData(db) });
});

export default app;
