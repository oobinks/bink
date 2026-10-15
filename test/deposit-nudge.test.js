// "Chase the deposit" reminder: a day after the quote, once, daytime only, only while the deposit is unpaid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { depositNudges } from '../worker/reminders.js';

// A tiny stand-in for Cloudflare's database, backed by SQLite in memory.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE bookings (id INTEGER PRIMARY KEY, status TEXT, client_name TEXT, event_type TEXT, event_date TEXT,
    deposit_pence INTEGER, deposit_paid_at TEXT, deposit_nudged_at TEXT, quote_sent_at TEXT, quote_accepted_at TEXT, is_sample INTEGER DEFAULT 0);
    CREATE TABLE push_subscriptions (endpoint TEXT);`);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => db.prepare(sql).run(...args),
  });
  return { raw: db, prepare: (sql) => stmt(sql) };
}

const at = (iso) => new Date(iso);
const add = (d, row) => d.raw.prepare(`INSERT INTO bookings (id, status, client_name, event_date, deposit_pence, deposit_paid_at, quote_sent_at, is_sample)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(row.id, row.status ?? 'quoted', row.name, row.date ?? '2026-12-12', row.deposit ?? 10000,
  row.paid ?? null, row.sent, row.sample ?? 0);

test('reminds once, a day after the quote, while the deposit is unpaid', async () => {
  const DB = fakeD1();
  add(DB, { id: 1, name: 'Jess', sent: '2026-10-14T10:00:00Z' }); // 24h+ ago at 11:00 on the 15th
  add(DB, { id: 2, name: 'Too soon', sent: '2026-10-15T08:00:00Z' });
  add(DB, { id: 3, name: 'Paid', sent: '2026-10-10T10:00:00Z', paid: '2026-10-11' });
  add(DB, { id: 4, name: 'No deposit', sent: '2026-10-10T10:00:00Z', deposit: 0 });
  add(DB, { id: 5, name: 'Confirmed', sent: '2026-10-10T10:00:00Z', status: 'confirmed' });
  add(DB, { id: 6, name: 'Sample', sent: '2026-10-10T10:00:00Z', sample: 1 });
  add(DB, { id: 7, name: 'Gig passed', sent: '2026-09-01T10:00:00Z', date: '2026-10-01' });
  const env = { DB };
  assert.equal(await depositNudges(env, at('2026-10-15T10:00:00Z')), 1);
  assert.ok(DB.raw.prepare('SELECT deposit_nudged_at FROM bookings WHERE id = 1').get().deposit_nudged_at);
  assert.equal(await depositNudges(env, at('2026-10-15T11:00:00Z')), 0, 'only once');
  assert.equal(await depositNudges(env, at('2026-10-16T10:00:00Z')), 1, 'the other quote, a day after it was sent');
});

test('waits for daytime (9am to 9pm UK)', async () => {
  const DB = fakeD1();
  add(DB, { id: 1, name: 'Jess', sent: '2026-10-13T22:00:00Z' });
  assert.equal(await depositNudges({ DB }, at('2026-10-15T02:00:00Z')), 0, '3am UK: wait');
  assert.equal(await depositNudges({ DB }, at('2026-10-15T08:00:00Z')), 1, '9am UK: remind');
});
