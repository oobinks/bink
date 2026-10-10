// The whole app's data lives in one SQLite file: data/app.db
// SQLite is a database that is just a file — easy to back up, nothing to install.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'app.db');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Each migration runs once, in order. Later phases append to this list, so
// existing data is never thrown away when the app is updated.
// Money is always stored in pence (whole numbers) to avoid rounding errors.
const migrations = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT
  );

  -- An enquiry and a booking are the same record moving through the pipeline:
  -- new -> quoted -> confirmed -> completed (or declined).
  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'new',
    source TEXT NOT NULL DEFAULT 'manual',
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    event_date TEXT,
    start_time TEXT,
    end_time TEXT,
    venue_name TEXT,
    venue_address TEXT,
    event_type TEXT,
    budget_pence INTEGER,
    notes TEXT,
    raw_form TEXT,
    price_pence INTEGER,
    extras TEXT NOT NULL DEFAULT '[]',
    seen_at TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX bookings_status ON bookings(status);
  CREATE INDEX bookings_date ON bookings(event_date);

  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_address TEXT,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]',
    total_pence INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    sent_at TEXT,
    paid_at TEXT,
    chasing_paused INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX invoices_status ON invoices(status);

  -- Clips: starred -> scheduled -> posted. Binned clips are deleted.
  CREATE TABLE clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    file_name TEXT,
    status TEXT NOT NULL DEFAULT 'starred',
    caption TEXT,
    hashtags TEXT,
    platforms TEXT NOT NULL DEFAULT '["instagram","tiktok"]',
    scheduled_at TEXT,
    posted_at TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX clips_status ON clips(status);
  `,
];

db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
const current = db.prepare('SELECT version FROM schema_version').get()?.version ?? 0;
if (current < migrations.length) {
  db.transaction(() => {
    for (let i = current; i < migrations.length; i++) db.exec(migrations[i]);
    db.prepare('DELETE FROM schema_version').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migrations.length);
  })();
}

export const now = () => new Date().toISOString();

// Today's date as YYYY-MM-DD in UK time, whatever the server clock's zone.
export function todayUK(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
}

export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
