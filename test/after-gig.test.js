// Phase 4: the morning after a gig — get paid, notes, done.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8789;
const base = `http://127.0.0.1:${PORT}`;
let proc;
let cookie = '';

before(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-after-'));
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

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let gig;

test('after-gig screen is private', async () => {
  const res = await fetch(base + '/api/after-gig');
  assert.equal(res.status, 401);
});

test("last night's gig shows up to wrap, at the top of the home screen, without double-nagging for an invoice", async () => {
  // A real gig last night with a £100 deposit already paid.
  const { id } = (await call('POST', '/api/bookings', { client_name: 'Jess Carter', client_email: 'jess@example.com', event_type: '30th', venue_name: 'The Golden Lion', event_date: addDays(today, -1) })).body;
  await call('PUT', `/api/bookings/${id}/quote`, { price_pence: 45000, extras: [], deposit_pence: 10000 });
  await call('POST', `/api/bookings/${id}/deposit`, { paid: true, date: addDays(today, -20) });
  gig = id;
  const list = (await call('GET', '/api/after-gig')).body;
  assert.ok(list.some((g) => g.id === id));
  const dash = (await call('GET', '/api/dashboard')).body;
  assert.equal(dash.attention.find((a) => a.kind === 'aftergig' && a.link === `/after/${id}`).title, 'How was The Golden Lion? Wrap it up');
  assert.ok(!(dash.attention.find((a) => a.kind === 'invoice')?.detail || '').includes('Jess Carter'), 'no separate "needs an invoice" nag');
});

test('the morning job runs the after-gig nudge without problems', async () => {
  const res = await fetch(`${base}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('0 9 * * *')}`);
  assert.equal(res.status, 200);
});

test('"Balance paid on the night" makes the invoice, takes off the deposit and marks it paid that night', async () => {
  const r = await call('POST', `/api/after-gig/${gig}/paid-on-night`);
  assert.equal(r.status, 200);
  const inv = (await call('GET', `/api/invoices/${r.body.invoiceId}`)).body;
  assert.equal(inv.state, 'paid');
  assert.equal(inv.total_pence, 35000, '£450 minus the £100 deposit');
  assert.equal(inv.paid_at, addDays(today, -1), 'dated the night of the gig');
  assert.equal((await call('GET', `/api/bookings/${gig}`)).body.status, 'completed');
  // Doing it twice doesn't make a second invoice.
  const again = await call('POST', `/api/after-gig/${gig}/paid-on-night`);
  assert.equal(again.body.invoiceId, r.body.invoiceId);
});

test('notes are saved, and Done clears it', async () => {
  await call('POST', `/api/after-gig/${gig}/notes`, { notes: 'Great crowd. Ask about NYE.' });
  assert.equal((await call('GET', `/api/bookings/${gig}`)).body.gig_notes, 'Great crowd. Ask about NYE.');
  assert.equal((await call('POST', `/api/after-gig/${gig}/wrap`, { notes: 'Great crowd. Ask about NYE!' })).status, 200);
  const b = (await call('GET', `/api/bookings/${gig}`)).body;
  assert.ok(b.wrapped_at);
  assert.equal(b.gig_notes, 'Great crowd. Ask about NYE!');
  assert.ok(!(await call('GET', '/api/after-gig')).body.some((g) => g.id === gig));
  const client = (await call('GET', `/api/clients/${b.client_id}`)).body;
  assert.equal(client.bookings[0].gig_notes, 'Great crowd. Ask about NYE!', 'notes show on the client profile');
});

test("future gigs and gigs over 2 weeks old don't show", async () => {
  const future = (await call('POST', '/api/bookings', { client_name: 'Future', event_date: addDays(today, 3) })).body.id;
  const old = (await call('POST', '/api/bookings', { client_name: 'Old', event_date: addDays(today, -20) })).body.id;
  for (const id of [future, old]) await call('POST', `/api/bookings/${id}/status`, { status: 'confirmed' });
  const ids = (await call('GET', '/api/after-gig')).body.map((g) => g.id);
  assert.ok(!ids.includes(future) && !ids.includes(old));
});
