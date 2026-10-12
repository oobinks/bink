// All data lives in a Cloudflare D1 database (SQLite in the cloud).
// The tables are created automatically the first time the app runs, and later
// phases add to the migration list — existing data is never thrown away.
// Money is always stored in pence (whole numbers) to avoid rounding errors.
import { loadSampleData } from './sample-data.js';

const migrations = [
  [
    `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    // An enquiry and a booking are the same record moving through the pipeline:
    // new -> quoted -> confirmed -> completed (or declined).
    `CREATE TABLE bookings (
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
    )`,
    `CREATE INDEX bookings_status ON bookings(status)`,
    `CREATE INDEX bookings_date ON bookings(event_date)`,
    `CREATE TABLE invoices (
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
    )`,
    `CREATE INDEX invoices_status ON invoices(status)`,
    // Clips: starred -> scheduled -> posted. Binned clips are deleted.
    `CREATE TABLE clips (
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
    )`,
    `CREATE INDEX clips_status ON clips(status)`,
    // Change history: every edit, so you can always see what changed and when.
    `CREATE TABLE activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT
    )`,
  ],
  [
    // Logged-in devices (only a scrambled copy of each login token is stored).
    `CREATE TABLE sessions (
      id_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT
    )`,
    `CREATE TABLE login_attempts (ip TEXT PRIMARY KEY, count INTEGER NOT NULL, until TEXT NOT NULL DEFAULT '')`,
  ],
  [
    // Phase 2: booking form fields, quotes, phone notifications.
    `ALTER TABLE bookings ADD COLUMN equipment TEXT`,
    `ALTER TABLE bookings ADD COLUMN guests INTEGER`,
    `ALTER TABLE bookings ADD COLUMN contact_method TEXT`,
    `ALTER TABLE bookings ADD COLUMN instagram TEXT`,
    `ALTER TABLE bookings ADD COLUMN travel_miles INTEGER`,
    `ALTER TABLE bookings ADD COLUMN quote_message TEXT`,
    `ALTER TABLE bookings ADD COLUMN quote_token TEXT`,
    `ALTER TABLE bookings ADD COLUMN quote_sent_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN quote_accepted_at TEXT`,
    `CREATE UNIQUE INDEX bookings_quote_token ON bookings(quote_token)`,
    `CREATE TABLE push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL
    )`,
    // Stops anyone spamming the public booking form.
    `CREATE TABLE public_hits (ip TEXT NOT NULL, hour TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (ip, hour))`,
  ],
  [
    // Phase 3: invoices get a private link (to view and pay) and a reminder log.
    `ALTER TABLE invoices ADD COLUMN token TEXT`,
    `ALTER TABLE invoices ADD COLUMN viewed_at TEXT`,
    `CREATE UNIQUE INDEX invoices_token ON invoices(token)`,
    `CREATE TABLE invoice_reminders (
      invoice_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      method TEXT NOT NULL,
      at TEXT NOT NULL,
      PRIMARY KEY (invoice_id, step)
    )`,
  ],
];

let ready = false;

// Brings the database up to date. Cheap after the first call.
export async function ensureSchema(db) {
  if (ready) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)').run();
  const current = (await db.prepare('SELECT version FROM schema_version').first('version')) ?? 0;
  if (current < migrations.length) {
    for (let i = current; i < migrations.length; i++) {
      await db.batch([
        ...migrations[i].map((sql) => db.prepare(sql)),
        db.prepare('DELETE FROM schema_version'),
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').bind(i + 1),
      ]);
    }
    // Brand new install: load the sample data so there's something to look at.
    if (current === 0) {
      await loadSampleData(db);
      await logActivity(db, 'App set up', 'Sample data loaded');
    }
  }
  ready = true;
}

export const now = () => new Date().toISOString();

// Today's date as YYYY-MM-DD in UK time.
export function todayUK(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
}

export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function logActivity(db, action, detail = null) {
  return db.prepare('INSERT INTO activity (at, action, detail) VALUES (?, ?, ?)').bind(now(), action, detail).run();
}

export const all = async (stmt) => (await stmt.all()).results;
