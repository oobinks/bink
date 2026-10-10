// Backups and "export everything".
// - Nightly: a copy of the database goes into your chosen backup folder
//   (e.g. a Google Drive / iCloud Drive folder so it's also off the laptop),
//   plus any new uploaded files. Old database copies are tidied after N days.
// - Export: one zip with every record as JSON + CSV, and all your files.
import fs from 'node:fs';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { db, DATA_DIR, UPLOADS_DIR, now } from './db.js';
import { getSetting, setSetting } from './settings.js';

export function backupFolder() {
  return getSetting('backups').folder || path.join(DATA_DIR, 'backups');
}

function copyNewFiles(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copied += copyNewFiles(src, dest);
    else if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
      fs.copyFileSync(src, dest);
      copied++;
    }
  }
  return copied;
}

export async function runBackup() {
  const cfg = getSetting('backups');
  const folder = backupFolder();
  try {
    fs.mkdirSync(path.join(folder, 'database'), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const file = path.join(folder, 'database', `app-${stamp}.db`);
    await db.backup(file); // safe copy even while the app is running
    copyNewFiles(UPLOADS_DIR, path.join(folder, 'uploads'));

    // Tidy up old database copies (uploaded files are never deleted from backups).
    const cutoff = Date.now() - (cfg.keepDays || 30) * 86400000;
    for (const f of fs.readdirSync(path.join(folder, 'database'))) {
      const p = path.join(folder, 'database', f);
      if (f.startsWith('app-') && fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    }
    setSetting('backups', { ...cfg, lastBackupAt: now(), lastBackupError: null });
    return { ok: true, file };
  } catch (err) {
    setSetting('backups', { ...cfg, lastBackupError: `${now()}: ${err.message}` });
    return { ok: false, error: err.message };
  }
}

const EXPORT_TABLES = ['bookings', 'invoices', 'clips'];

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function streamExport(res) {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="ctrinn-export-${stamp}.zip"`);
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on('error', (err) => res.destroy(err));
  zip.pipe(res);

  const all = {};
  for (const t of EXPORT_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
    all[t] = rows;
    zip.append(toCSV(rows), { name: `csv/${t}.csv` });
  }
  // Settings without the password hash.
  all.settings = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE key != 'auth'").all().map((r) => [r.key, JSON.parse(r.value)])
  );
  zip.append(JSON.stringify(all, null, 2), { name: 'everything.json' });
  zip.append(
    'Your ctrinn DJ HQ export.\n\n' +
    '- everything.json: every record and setting (machine-readable)\n' +
    '- csv/: one spreadsheet per section, opens in Excel, Numbers or Google Sheets\n' +
    '- uploads/: all your photos, videos and documents\n',
    { name: 'README.txt' }
  );
  if (fs.existsSync(UPLOADS_DIR)) zip.directory(UPLOADS_DIR, 'uploads');
  zip.finalize();
}
