// Runs the real app on Cloudflare's local simulator with a fresh database and checks it end to end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8790;
const base = `http://127.0.0.1:${PORT}`;
let proc;

before(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-'));
  proc = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state,
    '--var', 'APP_PASSWORD:mirrorball-2026'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) {
    try { await fetch(base + '/'); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('The local simulator did not start');
});

after(() => process.kill(-proc.pid));

let cookie = '';
const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('everything is locked until you log in', async () => {
  assert.deepEqual((await call('GET', '/api/auth/status')).body, { mode: 'password', loggedIn: false });
  assert.equal((await call('GET', '/api/dashboard')).status, 401);
  assert.equal((await call('GET', '/api/settings/export')).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { password: 'wrong-password' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { password: 'mirrorball-2026' })).status, 200);
  assert.match(cookie, /^djhq_session=[0-9a-f]{64}$/);
  assert.deepEqual((await call('GET', '/api/auth/status')).body, { mode: 'password', loggedIn: true });
});

test('serves the app screens for any page address', async () => {
  const res = await fetch(base + '/invoices/12');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<div id="root">/);
});

test('dashboard shows sample gigs, enquiries and overdue invoices', async () => {
  const { status, body } = await call('GET', '/api/dashboard');
  assert.equal(status, 200);
  assert.ok(body.upcomingGigs.length >= 3);
  assert.equal(body.newEnquiries.length, 2);
  assert.ok(body.unpaid.some((i) => i.state === 'overdue'));
  assert.ok(body.attention.some((a) => a.kind === 'aftergig'), "flags last night's gig to wrap up");
});

test('settings save known fields only and validate numbers', async () => {
  assert.equal((await call('PUT', '/api/settings/invoicing', { paymentTermsDays: 'soon' })).status, 400);
  const ok = await call('PUT', '/api/settings/bank', { sortCode: '12-34-56', notAField: 'x' });
  assert.equal(ok.body.sortCode, '12-34-56');
  assert.equal(ok.body.notAField, undefined);
  assert.equal((await call('PUT', '/api/settings/backups', { lastBackupAt: 'x' })).status, 404);
  const s = (await call('GET', '/api/settings')).body;
  assert.equal(s.business.email, 'ctrinn.music@gmail.com');
  assert.equal(s.bank.sortCode, '12-34-56');
});

test('changes are recorded in the history', async () => {
  const rows = (await call('GET', '/api/settings/activity')).body;
  assert.ok(rows.some((r) => r.action === 'Bank details updated'));
});

test('backups save and can be downloaded; export has every table', async () => {
  assert.equal((await call('POST', '/api/settings/backup-now')).status, 200);
  const list = (await call('GET', '/api/settings/backups')).body;
  assert.ok(list.length >= 1);
  const dl = await fetch(base + '/api/settings/backups/' + encodeURIComponent(list[0].key), { headers: { cookie } });
  assert.equal(dl.status, 200);
  assert.ok((await dl.json()).tables.bookings.length > 0);
  const exp = (await call('GET', '/api/settings/export')).body;
  assert.deepEqual(Object.keys(exp.tables).sort(), ['activity', 'bookings', 'clients', 'clips', 'invoices']);
});

test('sample data can be removed in one go', async () => {
  assert.equal((await call('POST', '/api/settings/sample-data', { action: 'clear' })).body.hasSampleData, false);
  assert.equal((await call('GET', '/api/dashboard')).body.upcomingGigs.length, 0);
});

test('logging out locks it again', async () => {
  const saved = cookie;
  assert.equal((await call('POST', '/api/auth/logout')).status, 200);
  assert.equal((await fetch(base + '/api/dashboard', { headers: { cookie: saved } })).status, 401);
});

test('5 wrong passwords lock logins for 15 minutes', async () => {
  cookie = '';
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/auth/login', { password: 'guess-' + i })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { password: 'mirrorball-2026' })).status, 429);
});
