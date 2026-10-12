// All data lives in a Cloudflare D1 database (SQLite in the cloud).
// The tables are created automatically the first time the app runs, and later
// phases add to the migration list — existing data is never thrown away.
// Money is always stored in pence (whole numbers) to avoid rounding errors.
import { loadSampleData } from './sample-data.js';

// Creates client profiles for any bookings/invoices not yet linked to one (matched by name),
// then links them. Used when profiles were first added, and after loading sample data.
export const LINK_CLIENTS_SQL = [
  `INSERT INTO clients (name, email, phone, address, instagram, is_sample, created_at, updated_at)
    SELECT name, MAX(email), MAX(phone), MAX(address), MAX(instagram), MIN(is_sample), MIN(created_at), MAX(created_at) FROM (
      SELECT trim(client_name) AS name, client_email AS email, client_phone AS phone, NULL AS address, instagram, is_sample, created_at
        FROM bookings WHERE client_id IS NULL
      UNION ALL
      SELECT trim(client_name), client_email, NULL, client_address, NULL, is_sample, created_at FROM invoices WHERE client_id IS NULL
    ) AS src
    WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE lower(c.name) = lower(src.name))
    GROUP BY lower(name)`,
  `UPDATE bookings SET client_id = (SELECT id FROM clients c WHERE lower(c.name) = lower(trim(bookings.client_name)) ORDER BY id LIMIT 1)
    WHERE client_id IS NULL`,
  `UPDATE invoices SET client_id = (SELECT id FROM clients c WHERE lower(c.name) = lower(trim(invoices.client_name)) ORDER BY id LIMIT 1)
    WHERE client_id IS NULL`,
];

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
  [
    // Client profiles. Bookings and invoices point at a client; existing ones are linked up by name.
    `CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      instagram TEXT,
      notes TEXT,
      is_sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX clients_name ON clients(lower(name))`,
    `CREATE INDEX clients_email ON clients(lower(email))`,
    `ALTER TABLE bookings ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`,
    `ALTER TABLE invoices ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`,
    ...LINK_CLIENTS_SQL,
  ],
  [
    // Deposits: £X to secure the date, balance on the night.
    `ALTER TABLE bookings ADD COLUMN deposit_pence INTEGER`,
    `ALTER TABLE bookings ADD COLUMN deposit_paid_at TEXT`,
  ],
  [
    // Answers to your own extra questions on the booking form: [{ id, question, answer }].
    `ALTER TABLE bookings ADD COLUMN answers TEXT`,
  ],
  [
    // After the gig: when you wrapped it up, and your notes from the night.
    `ALTER TABLE bookings ADD COLUMN wrapped_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN gig_notes TEXT`,
  ],
  [
    // Content hub: clip files live in Cloudflare storage. Status now also has 'uploading' and 'new' (not reviewed yet).
    `ALTER TABLE clips ADD COLUMN r2_key TEXT`,
    `ALTER TABLE clips ADD COLUMN upload_id TEXT`,
    `ALTER TABLE clips ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE clips ADD COLUMN content_type TEXT`,
    `ALTER TABLE clips ADD COLUMN reminded_at TEXT`,
    `CREATE INDEX clips_booking ON clips(booking_id)`,
  ],
  [
    // Press pack: which clips and photos are on it, and in what order. Status 'library' = kept for the press pack only.
    `ALTER TABLE clips ADD COLUMN in_press INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE clips ADD COLUMN press_order INTEGER NOT NULL DEFAULT 0`,
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

// The time right now in the UK, as YYYY-MM-DDTHH:MM (how clip post times are stored).
export function nowUK(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
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
