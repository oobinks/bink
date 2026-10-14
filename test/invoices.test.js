// Phase 3 end to end: invoice from a booking, send, client view, paid, reports, reminders.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8796;
const base = `http://127.0.0.1:${PORT}`;
let proc;
let cookie = '';

before(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-invoices-'));
  proc = spawn('npx', ['wrangler', 'dev', '--env', 'test', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state, '--test-scheduled',
    '--var', 'APP_PASSWORD:mirrorball-2026'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) {
    try { await fetch(base + '/'); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'mirrorball-2026' }),
  });
  cookie = res.headers.get('set-cookie').split(';')[0];
});

after(() => process.kill(-proc.pid));

const call = async (method, url, body, { auth = true } = {}) => {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(auth ? { cookie } : {}) }, body: body && JSON.stringify(body) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
};

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let id;
let token;

test('invoices are private without logging in', async () => {
  assert.equal((await call('GET', '/api/invoices', null, { auth: false })).status, 401);
  assert.equal((await call('GET', '/api/invoices/export.csv', null, { auth: false })).status, 401);
});

test('one tap from a booking makes a draft with everything filled in', async () => {
  const booking = (await call('POST', '/api/bookings', { client_name: 'Jess Carter', client_email: 'jess@example.com', event_type: '30th Birthday Party', event_date: addDays(today, -2), venue_name: 'The Golden Lion' })).body.id;
  await call('PUT', `/api/bookings/${booking}/quote`, { price_pence: 35000, extras: [{ label: 'Speakers, lights & DJ booth', pence: 10000 }] });
  await call('POST', `/api/bookings/${booking}/status`, { status: 'confirmed' });
  const r = await call('POST', `/api/invoices/from-booking/${booking}`);
  id = r.body.id;
  const inv = (await call('GET', `/api/invoices/${id}`)).body;
  assert.equal(inv.number, 'CT-001');
  assert.equal(inv.state, 'draft');
  assert.equal(inv.client_email, 'jess@example.com');
  assert.equal(inv.total_pence, 45000);
  assert.equal(inv.items.length, 2);
  assert.match(inv.items[0].description, /30th Birthday Party at The Golden Lion/);
  assert.equal(inv.issue_date, today);
  assert.equal(inv.due_date, addDays(today, 7), 'due in 7 days by default');
  assert.equal((await call('POST', `/api/invoices/from-booking/${booking}`)).body.existing, true, 'a second tap opens the same invoice');
  token = inv.token;
});

test('numbers go up by one; manual invoices work too', async () => {
  const r = await call('POST', '/api/invoices', { client_name: 'Walk-in Bar' });
  assert.equal((await call('GET', `/api/invoices/${r.body.id}`)).body.number, 'CT-002');
  assert.equal((await call('POST', '/api/invoices', {})).status, 400);
  assert.equal((await call('DELETE', `/api/invoices/${r.body.id}`)).status, 200);
});

test('editing checks the lines and dates', async () => {
  assert.equal((await call('PATCH', `/api/invoices/${id}`, { items: [] })).status, 400);
  assert.equal((await call('PATCH', `/api/invoices/${id}`, { due_date: 'soon' })).status, 400);
  assert.equal((await call('PATCH', `/api/invoices/${id}`, { items: [{ description: 'DJ set', pence: 40000 }, { description: 'Travel', pence: 1500 }] })).status, 200);
  assert.equal((await call('GET', `/api/invoices/${id}`)).body.total_pence, 41500);
});

test("drafts can't be seen by clients; emailing needs Gmail connected", async () => {
  assert.equal((await call('GET', `/api/public/invoice/${token}`, null, { auth: false })).status, 404);
  const r = await call('POST', `/api/invoices/${id}/send`, { method: 'email' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /not connected/);
});

test('sending yourself marks it sent; the client can then view it with bank details', async () => {
  await call('PUT', '/api/settings/bank', { sortCode: '04-00-04', accountNumber: '12345678', accountName: 'C Trinn' });
  const r = await call('POST', `/api/invoices/${id}/send`, { method: 'manual' });
  assert.equal(r.body.emailed, false);
  assert.ok(r.body.link.endsWith(`/i/${token}`));
  const pub = await call('GET', `/api/public/invoice/${token}`, null, { auth: false });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.bank.sortCode, '04-00-04');
  assert.equal(pub.body.reference, 'CT-001');
  assert.equal(pub.body.totalPence, 41500);
});

test('the morning job reminds you to chase on the due date (Gmail not connected)', async () => {
  // Due today. The "2 days before" reminder fell before the invoice was sent, so it's skipped.
  await call('PATCH', `/api/invoices/${id}`, { issue_date: addDays(today, -7), due_date: today });
  const res = await fetch(`${base}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('0 9 * * *')}`);
  assert.equal(res.status, 200);
  const inv = (await call('GET', `/api/invoices/${id}`)).body;
  const byStep = Object.fromEntries(inv.reminders.map((r) => [r.step, r.method]));
  assert.deepEqual(byStep, { 0: 'skipped', 1: 'notified' });
  // Running again the same day does nothing new.
  await fetch(`${base}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('0 9 * * *')}`);
  assert.equal((await call('GET', `/api/invoices/${id}`)).body.reminders.length, 2);
  // Sample invoices are never chased.
  const list = (await call('GET', '/api/invoices')).body;
  const sample = list.find((i) => i.number === 'SAMPLE-002');
  assert.equal((await call('GET', `/api/invoices/${sample.id}`)).body.reminders.length, 0);
});

test('pausing reminders for one invoice', async () => {
  assert.equal((await call('POST', `/api/invoices/${id}/chasing`, { paused: true })).status, 200);
  assert.equal((await call('GET', `/api/invoices/${id}`)).body.chasing_paused, 1);
});

test('mark paid in one tap, and undo', async () => {
  assert.equal((await call('POST', `/api/invoices/${id}/paid`, {})).status, 200);
  let inv = (await call('GET', `/api/invoices/${id}`)).body;
  assert.equal(inv.state, 'paid');
  assert.equal(inv.paid_at, today);
  await call('POST', `/api/invoices/${id}/paid`, { paid: false });
  inv = (await call('GET', `/api/invoices/${id}`)).body;
  assert.equal(inv.state, 'viewed', 'back to unpaid (the client has opened it)');
  await call('POST', `/api/invoices/${id}/paid`, {});
});

test('money report: by month, by tax year, who owes what; CSV export', async () => {
  const r = (await call('GET', '/api/invoices/report')).body;
  assert.equal(r.months.length, 12);
  assert.equal(r.months.at(-1).month, today.slice(0, 7));
  assert.ok(r.months.at(-1).pence >= 41500);
  assert.ok(r.taxYears.find((t) => t.year === r.currentTaxYear).pence >= 41500);
  assert.ok(r.owed.some((o) => o.client === "Copper Bar Bishop's Stortford" && o.overduePence === 28000), 'sample overdue invoice listed');
  const csv = (await call('GET', '/api/invoices/export.csv')).body;
  assert.match(csv.split('\r\n')[0], /^Number,Client,Email,Issued,Due,Status/);
  assert.ok(csv.includes('CT-001,Jess Carter'));
});

test('emails & reminders settings are validated', async () => {
  const s = (await call('GET', '/api/settings')).body.emails;
  assert.equal(s.steps.length, 4);
  assert.equal((await call('PUT', '/api/settings/emails', { steps: s.steps.slice(0, 2) })).status, 400);
  const changed = s.steps.map((st, i) => (i === 3 ? { ...st, days: 21 } : st));
  assert.equal((await call('PUT', '/api/settings/emails', { steps: changed, chaseOn: true })).body.steps[3].days, 21);
  const status = (await call('GET', '/api/email-status')).body;
  assert.equal(status.ready, false);
  assert.equal(status.from, 'ctrinn.music@gmail.com', 'sends from the Settings email unless GMAIL_ADDRESS is set');
});
