// Client profiles: auto-created from bookings/invoices, repeat invoices, stats, and staying tidy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8798;
const base = `http://127.0.0.1:${PORT}`;
let proc;
let cookie = '';

before(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-clients-'));
  proc = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state,
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
  return { status: res.status, body: await res.json().catch(() => null) };
};
const clientNamed = async (name) => (await call('GET', '/api/clients')).body.find((c) => c.name === name);
const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

test('client profiles are private', async () => {
  assert.equal((await call('GET', '/api/clients', null, { auth: false })).status, 401);
});

test('existing clients get profiles automatically; repeat clients appear once', async () => {
  const list = (await call('GET', '/api/clients')).body;
  assert.equal(list.filter((c) => c.name === 'Neon Rooms').length, 1);
  const neon = list.find((c) => c.name === 'Neon Rooms');
  assert.equal(neon.gigs, 2);
  assert.equal(neon.email, 'bookings@neonrooms.example');
  const laura = list.find((c) => c.name === 'Laura Kemp');
  assert.equal(laura.paid_pence, 80000);
});

test('a profile shows their invoices, bookings and totals', async () => {
  const copper = await clientNamed("Copper Bar Bishop's Stortford");
  const p = (await call('GET', `/api/clients/${copper.id}`)).body;
  assert.equal(p.invoices.length, 1);
  assert.equal(p.bookings.length, 1);
  assert.deepEqual(p.stats, { paidPence: 0, owedPence: 28000, overduePence: 28000, gigs: 1 });
});

test('one tap: new invoice for a repeat client with their details and last lines (old date removed)', async () => {
  const neon = await clientNamed('Neon Rooms');
  // Give them a previous invoice to copy from.
  const past = (await call('GET', '/api/bookings?status=completed')).body.bookings.find((b) => b.client_name === 'Neon Rooms');
  const first = (await call('POST', `/api/invoices/from-booking/${past.id}`)).body.id;
  assert.equal((await call('GET', `/api/invoices/${first}`)).body.client_id, neon.id);
  await call('PATCH', `/api/clients/${neon.id}`, { address: '1 Marine Parade\nSouthend-on-Sea' });

  const r = (await call('POST', `/api/clients/${neon.id}/invoice`)).body;
  assert.equal(r.copiedFromLast, true);
  const inv = (await call('GET', `/api/invoices/${r.id}`)).body;
  assert.equal(inv.client_name, 'Neon Rooms');
  assert.equal(inv.client_email, 'bookings@neonrooms.example');
  assert.equal(inv.client_address, '1 Marine Parade\nSouthend-on-Sea');
  assert.equal(inv.client_id, neon.id);
  assert.equal(inv.state, 'draft');
  assert.deepEqual(inv.items, [{ description: 'DJ performance: Club night at Neon Rooms', pence: 35000 }]);
});

test('a brand-new client starts with a blank line', async () => {
  const { id } = (await call('POST', '/api/clients', { name: 'The Golden Lion', email: 'gm@goldenlion.example' })).body;
  const r = (await call('POST', `/api/clients/${id}/invoice`)).body;
  assert.equal(r.copiedFromLast, false);
  assert.deepEqual((await call('GET', `/api/invoices/${r.id}`)).body.items, [{ description: 'DJ performance', pence: 0 }]);
});

test('new enquiries link to the existing profile by email, and fill in missing details', async () => {
  const before = (await call('GET', '/api/clients')).body.length;
  const r = await call('POST', '/api/public/enquiry', {
    client_name: 'Golden Lion (Gary)', event_type: 'Pub party', event_date: future(40), start_time: '20:00', end_time: '23:30',
    venue_name: 'The Golden Lion', venue_address: 'Harlow CM20 1AB', equipment: 'no', guests: 120, contact_method: 'phone',
    client_phone: '07700 900222', client_email: 'GM@goldenlion.example',
  }, { auth: false });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/api/clients')).body.length, before, 'no duplicate profile');
  const lion = await clientNamed('The Golden Lion');
  assert.equal(lion.phone, '07700 900222', 'phone filled in from the enquiry');
  assert.equal((await call('GET', `/api/clients/${lion.id}`)).body.bookings.length, 1);
});

test('names match regardless of capitals; editing is validated', async () => {
  const before = (await call('GET', '/api/clients')).body.length;
  await call('POST', '/api/invoices', { client_name: 'neon rooms' });
  assert.equal((await call('GET', '/api/clients')).body.length, before);
  const neon = await clientNamed('Neon Rooms');
  assert.equal((await call('PATCH', `/api/clients/${neon.id}`, { name: '' })).status, 400);
  assert.equal((await call('PATCH', `/api/clients/${neon.id}`, { email: 'not-an-email' })).status, 400);
  assert.equal((await call('PATCH', `/api/clients/${neon.id}`, { instagram: 'neonrooms', notes: 'Pays fast' })).status, 200);
  assert.equal((await call('GET', `/api/clients/${neon.id}`)).body.instagram, '@neonrooms');
});

test('deleting a profile keeps their invoices and bookings', async () => {
  const lion = await clientNamed('The Golden Lion');
  const p = (await call('GET', `/api/clients/${lion.id}`)).body;
  assert.equal((await call('DELETE', `/api/clients/${lion.id}`)).status, 200);
  assert.equal((await call('GET', `/api/invoices/${p.invoices[0].id}`)).status, 200);
  assert.equal((await call('GET', `/api/bookings/${p.bookings[0].id}`)).status, 200);
});

test('clients are in the export; removing sample data removes sample-only clients', async () => {
  const exp = (await call('GET', '/api/settings/export')).body;
  assert.ok(exp.tables.clients.length > 0);
  await call('POST', '/api/settings/sample-data', { action: 'clear' });
  const names = (await call('GET', '/api/clients')).body.map((c) => c.name);
  assert.ok(!names.includes('Laura Kemp'), 'sample-only client removed');
  assert.ok(names.includes('Neon Rooms'), 'kept: has a real invoice now');
});
