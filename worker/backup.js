// Backups.
// 1. Cloudflare keeps its own restore points for the database (Time Travel):
//    any minute in the last 7 days can be restored.
// 2. Every night the app also saves a full snapshot (every record and setting)
//    into Cloudflare KV storage and keeps the last 30. You can download any of
//    them from Settings. Later, these will also be copied to your Google Drive.
import { now, logActivity } from './db.js';
import { getSetting, setSetting } from './settings.js';

export const EXPORT_TABLES = ['clients', 'bookings', 'invoices', 'clips', 'activity'];
const KEEP = 30;

export async function snapshot(db) {
  const data = { exportedAt: now(), tables: {} };
  for (const t of EXPORT_TABLES) data.tables[t] = (await db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()).results;
  // The notification signing key stays private (devices just re-register if it's ever lost).
  const rows = (await db.prepare("SELECT key, value FROM settings WHERE key != 'vapid'").all()).results;
  data.settings = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return data;
}

export async function runBackup(env) {
  const cfg = await getSetting(env.DB, 'backups');
  try {
    const data = await snapshot(env.DB);
    const key = `backup:${data.exportedAt}`;
    await env.BACKUPS.put(key, JSON.stringify(data), { metadata: { at: data.exportedAt } });
    // Keep the newest 30.
    const keys = (await env.BACKUPS.list({ prefix: 'backup:' })).keys.map((k) => k.name).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) await env.BACKUPS.delete(old);
    await setSetting(env.DB, 'backups', { ...cfg, lastBackupAt: data.exportedAt, lastBackupError: null });
    return { ok: true, key };
  } catch (err) {
    await setSetting(env.DB, 'backups', { ...cfg, lastBackupError: `${now()}: ${err.message}` });
    await logActivity(env.DB, 'Backup failed', err.message);
    return { ok: false, error: err.message };
  }
}

export async function listBackups(env) {
  const keys = (await env.BACKUPS.list({ prefix: 'backup:' })).keys;
  return keys.map((k) => ({ key: k.name, at: k.metadata?.at || k.name.slice(7) })).sort((a, b) => (a.at < b.at ? 1 : -1));
}
