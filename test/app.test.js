// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-test-'));
let app;
let server;
let base;
let cookie = '';

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
}

before(async () => {
  ({ app } = await import('../server/index.js'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('first run asks for a password and blocks everything else', async () => {
  assert.deepEqual((await call('GET', '/api/auth/status')).body, { needsSetup: true, loggedIn: false });
  assert.equal((await call('GET', '/api/dashboard')).status, 401);
  assert.equal((await call('POST', '/api/auth/setup', { password: 'short' })).status, 400);
  assert.equal((await call('POST', '/api/auth/setup', { password: 'discoball123' })).status, 200);
  assert.equal((await call('POST', '/api/auth/setup', { password: 'another-one' })).status, 400);
});

test('wrong passwords are rejected and lock out after 5 tries', async () => {
  const saved = cookie;
  cookie = '';
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/auth/login', { password: 'nope-nope' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { password: 'discoball123' })).status, 429);
  cookie = saved;
});

test('dashboard shows sample gigs, enquiries and overdue invoices', async () => {
  const { status, body } = await call('GET', '/api/dashboard');
  assert.equal(status, 200);
  assert.ok(body.upcomingGigs.length >= 3);
  assert.equal(body.newEnquiries.length, 2);
  assert.ok(body.unpaid.some((i) => i.state === 'overdue'));
  assert.ok(body.attention.some((a) => a.kind === 'invoice'), 'flags the past gig with no invoice');
});

test('settings save known fields only and validate numbers', async () => {
  const bad = await call('PUT', '/api/settings/invoicing', { paymentTermsDays: 'soon' });
  assert.equal(bad.status, 400);
  const ok = await call('PUT', '/api/settings/bank', { sortCode: '12-34-56', notAField: 'x' });
  assert.equal(ok.body.sortCode, '12-34-56');
  assert.equal(ok.body.notAField, undefined);
  assert.equal((await call('PUT', '/api/settings/auth', {})).status, 404);
  const s = (await call('GET', '/api/settings')).body;
  assert.equal(s.business.email, 'ctrinn.music@gmail.com');
  assert.equal(s.auth, undefined, 'password hash never sent to the browser');
});

test('backup and export work, and the export has no password', async () => {
  assert.equal((await call('POST', '/api/settings/backup-now')).status, 200);
  const exp = await call('GET', '/api/settings/export');
  assert.equal(exp.status, 200);
  const text = Buffer.from(exp.body).toString('latin1');
  assert.ok(text.includes('everything.json'));
  assert.ok(!text.includes('passwordHash'));
});

test('sample data can be removed in one go', async () => {
  const r = await call('POST', '/api/settings/sample-data', { action: 'clear' });
  assert.equal(r.body.hasSampleData, false);
  const d = (await call('GET', '/api/dashboard')).body;
  assert.equal(d.upcomingGigs.length, 0);
});
