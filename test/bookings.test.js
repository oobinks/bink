// Phase 2 end to end: booking form -> enquiry -> quote -> client accepts -> calendar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8794;
const base = `http://127.0.0.1:${PORT}`;
let proc;
let cookie = '';

before(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-bookings-'));
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

const call = async (method, url, body, { auth = true, ip } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (auth) headers.cookie = cookie;
  if (ip) headers['cf-connecting-ip'] = ip;
  const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
};

const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const enquiry = {
  client_name: 'Jess Carter', event_type: '30th Birthday Party', event_date: future(60), start_time: '19:30', end_time: '00:30',
  venue_name: 'The Golden Lion', venue_address: '12 High Street, Harlow CM20 1AB', equipment: 'yes', guests: '90',
  contact_method: 'instagram', client_phone: '07700 900111', client_email: 'jess@example.com', instagram: 'instagram.com/jess.carter',
  budget_pence: 45000, notes: 'Disco please',
};
let id;
let token;

test('booking data is private without logging in', async () => {
  assert.equal((await call('GET', '/api/bookings', null, { auth: false })).status, 401);
  assert.equal((await call('GET', '/api/bookings/1', null, { auth: false })).status, 401);
});

test('the public form shows your wording without logging in', async () => {
  const r = await call('GET', '/api/public/form', null, { auth: false });
  assert.equal(r.body.title, 'Private Party Booking Enquiry');
  assert.equal(r.body.djName, 'ctrinn');
});

test('the form insists on the required questions, a real email and a future date', async () => {
  const opts = { auth: false, ip: '10.0.0.1' };
  assert.equal((await call('POST', '/api/public/enquiry', { client_name: 'x' }, opts)).status, 400);
  assert.equal((await call('POST', '/api/public/enquiry', { ...enquiry, client_email: 'nope' }, opts)).status, 400);
  assert.equal((await call('POST', '/api/public/enquiry', { ...enquiry, event_date: '2020-01-01' }, opts)).status, 400);
});

test('a filled-in form becomes a New enquiry with every answer', async () => {
  const r = await call('POST', '/api/public/enquiry', enquiry, { auth: false, ip: '10.0.0.2' });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /Thanks/);
  const list = (await call('GET', '/api/bookings?status=new')).body;
  const b = list.bookings.find((x) => x.client_name === 'Jess Carter');
  assert.ok(b, 'appears in New');
  assert.equal(b.seen_at, null, 'marked unread');
  id = b.id;
  const full = (await call('GET', `/api/bookings/${id}`)).body;
  assert.equal(full.instagram, '@jess.carter');
  assert.equal(full.guests, 90);
  assert.equal(full.equipment, 'yes');
  assert.equal(full.source, 'form');
  assert.ok(full.seen_at, 'opening it marks it read');
});

test('robots filling the hidden box are ignored; spam is limited per hour', async () => {
  const before = (await call('GET', '/api/bookings?status=new')).body.bookings.length;
  assert.equal((await call('POST', '/api/public/enquiry', { ...enquiry, website: 'x' }, { auth: false, ip: '10.0.0.3' })).status, 200);
  assert.equal((await call('GET', '/api/bookings?status=new')).body.bookings.length, before);
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call('POST', '/api/public/enquiry', { client_name: 'spam' }, { auth: false, ip: '10.0.0.4' })).status);
  assert.equal(codes.at(-1), 429);
});

test('quote: price + extras, then send makes a private link and moves to Quoted', async () => {
  assert.equal((await call('POST', `/api/bookings/${id}/quote/send`)).status, 400, 'needs a price first');
  const saved = await call('PUT', `/api/bookings/${id}/quote`, {
    price_pence: 35000, extras: [{ label: 'Speakers, lights & DJ booth', pence: 10000 }, { label: 'Travel (32 miles)', pence: 540 }],
    travel_miles: 32, quote_message: 'Can’t wait!',
  });
  assert.equal(saved.body.total_pence, 45540);
  const sent = await call('POST', `/api/bookings/${id}/quote/send`);
  assert.equal(sent.body.status, 'quoted');
  token = sent.body.path.split('/q/')[1];
  assert.match(token, /^[0-9a-f]{32}$/);
});

test('the client sees the quote with the £100 deposit and balance, and can accept it', async () => {
  await call('PUT', '/api/settings/bank', { sortCode: '04-00-04', accountNumber: '12345678' });
  const q = await call('GET', `/api/public/quote/${token}`, null, { auth: false });
  assert.equal(q.body.totalPence, 45540);
  assert.equal(q.body.depositPence, 10000, 'default £100 deposit');
  assert.equal(q.body.balancePence, 35540);
  assert.equal(q.body.items.length, 3);
  assert.deepEqual(q.body.items[0], { label: 'DJ Cost', pence: 35000 }, 'first line is always "DJ Cost"');
  assert.equal(q.body.accepted, false);
  assert.equal(q.body.bank, null, 'no bank details until accepted');
  assert.equal(q.body.business.phone, '07818543677');
  assert.equal((await call('GET', '/api/public/quote/0123456789abcdef0123456789abcdef', null, { auth: false })).status, 404);
  assert.equal((await call('POST', `/api/public/quote/${token}/accept`, null, { auth: false })).status, 200);
  const b = (await call('GET', `/api/bookings/${id}`)).body;
  assert.equal(b.status, 'quoted', 'not confirmed until the deposit arrives');
  assert.ok(b.quote_accepted_at);
  const after = (await call('GET', `/api/public/quote/${token}`, null, { auth: false })).body;
  assert.equal(after.accepted, true);
  assert.equal(after.confirmed, false);
  assert.equal(after.bank.sortCode, '04-00-04', 'bank details shown to pay the deposit');
  assert.equal((await call('POST', `/api/public/quote/${token}/accept`, null, { auth: false })).status, 200, 'accepting twice is harmless');
  const dash = (await call('GET', '/api/dashboard')).body;
  assert.ok(dash.attention.some((a) => a.kind === 'deposit' && a.detail.includes('Jess Carter')));
});

test('"Deposit received" confirms the booking and counts as income', async () => {
  const r = await call('POST', `/api/bookings/${id}/deposit`, { paid: true });
  assert.equal(r.status, 200);
  const b = (await call('GET', `/api/bookings/${id}`)).body;
  assert.equal(b.status, 'confirmed');
  assert.ok(b.deposit_paid_at);
  assert.equal((await call('GET', `/api/public/quote/${token}`, null, { auth: false })).body.confirmed, true);
  const report = (await call('GET', '/api/invoices/report')).body;
  assert.ok(report.months.at(-1).pence >= 10000, 'deposit counted this month');
});

test('the invoice takes off the deposit and the balance is due on the night', async () => {
  const { id: invId } = (await call('POST', `/api/invoices/from-booking/${id}`)).body;
  const inv = (await call('GET', `/api/invoices/${invId}`)).body;
  assert.equal(inv.total_pence, 35540);
  assert.equal(inv.items.at(-1).pence, -10000);
  assert.match(inv.items.at(-1).description, /^Less deposit paid/);
  assert.equal(inv.due_date, enquiry.event_date);
  assert.equal(inv.notes, 'Balance payable on the night.');
  await call('DELETE', `/api/invoices/${invId}`);
});

test('a club set added by hand starts confirmed with its fee, and invoices on normal payment terms', async () => {
  assert.equal((await call('POST', '/api/bookings', { kind: 'club', event_date: future(10), price_pence: 25000 })).status, 400, 'needs the venue');
  assert.equal((await call('POST', '/api/bookings', { kind: 'club', venue_name: 'Neon Rooms', price_pence: 25000 })).status, 400, 'needs the date');
  const r = await call('POST', '/api/bookings', { kind: 'club', venue_name: 'Neon Rooms', event_date: future(10),
    start_time: '23:00', end_time: '01:00', price_pence: 25000, client_email: 'promoter@example.com' });
  assert.equal(r.status, 200);
  const b = (await call('GET', `/api/bookings/${r.body.id}`)).body;
  assert.deepEqual([b.kind, b.status, b.client_name, b.event_type, b.total_pence, b.deposit_pence], ['club', 'confirmed', 'Neon Rooms', 'Club set', 25000, 0]);
  assert.ok((await call('GET', '/api/bookings?status=confirmed')).body.bookings.some((x) => x.id === b.id && x.kind === 'club'));
  const { id: invId } = (await call('POST', `/api/invoices/from-booking/${b.id}`)).body;
  const inv = (await call('GET', `/api/invoices/${invId}`)).body;
  assert.equal(inv.total_pence, 25000);
  assert.match(inv.items[0].description, /^DJ set: Club set at Neon Rooms/);
  assert.notEqual(inv.notes, 'Balance payable on the night.');
  assert.notEqual(inv.due_date, b.event_date, 'due on payment terms, not on the night');
  const history = (await call('GET', '/api/settings/activity')).body;
  assert.ok(history.some((h) => h.action === 'Club set added'));
  await call('DELETE', `/api/invoices/${invId}`);
  await call('DELETE', `/api/bookings/${b.id}`);
  // The public form can't create club sets.
  await call('POST', '/api/public/enquiry', { ...enquiry, client_name: 'Sneaky', kind: 'club' }, { auth: false, ip: '10.0.0.9' });
  const sneaky = (await call('GET', '/api/bookings?status=new')).body.bookings.find((x) => x.client_name === 'Sneaky');
  if (sneaky) assert.equal(sneaky.kind, 'party');
});

test('the deposit can be changed per quote, but not above the total', async () => {
  assert.equal((await call('PUT', `/api/bookings/${id}/quote`, { price_pence: 35000, extras: [], deposit_pence: 50000 })).status, 400);
  const ok = await call('PUT', `/api/bookings/${id}/quote`, { price_pence: 35000, extras: [{ label: 'Speakers, lights & DJ booth', pence: 10000 }, { label: 'Travel (32 miles)', pence: 540 }], deposit_pence: 10000 });
  assert.equal(ok.body.deposit_pence, 10000);
});

test('confirming another gig on the same day warns about the clash', async () => {
  const other = (await call('POST', '/api/bookings', { client_name: 'Rival Party', event_date: enquiry.event_date })).body.id;
  const r = await call('POST', `/api/bookings/${other}/status`, { status: 'confirmed' });
  assert.equal(r.body.clashes[0].client_name, 'Jess Carter');
  const detail = (await call('GET', `/api/bookings/${id}`)).body;
  assert.equal(detail.clashes[0].client_name, 'Rival Party');
});

test('confirmed gigs appear in the month view and the phone calendar feed', async () => {
  const month = enquiry.event_date.slice(0, 7);
  const cal = (await call('GET', `/api/bookings/calendar?month=${month}`)).body;
  assert.ok(cal.some((b) => b.client_name === 'Jess Carter'));
  const { path: feed } = (await call('GET', '/api/calendar-link')).body;
  const ics = await call('GET', feed, null, { auth: false });
  assert.equal(ics.status, 200);
  assert.match(ics.body, /BEGIN:VCALENDAR/);
  assert.match(ics.body, /The Golden Lion/);
  // Finishing at 00:30 means the next day.
  const next = new Date(enquiry.event_date + 'T12:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  assert.ok(ics.body.includes(`DTEND;TZID=Europe/London:${next.toISOString().slice(0, 10).replace(/-/g, '')}T003000`));
  assert.equal((await call('GET', '/cal/wrong.ics', null, { auth: false })).status, 404);
});

test('settings: price presets are validated and saved', async () => {
  assert.equal((await call('PUT', '/api/settings/pricing', { presets: [{ name: '', pence: 100 }] })).status, 400);
  const ok = await call('PUT', '/api/settings/pricing', { presets: [{ name: 'Wedding', pence: 70000 }], extraHourPence: 6000 });
  assert.deepEqual(ok.body.presets, [{ name: 'Wedding', pence: 70000 }]);
  assert.equal(ok.body.extraHourPence, 6000);
});

test('declining and deleting', async () => {
  assert.equal((await call('POST', `/api/bookings/${id}/status`, { status: 'declined' })).status, 200);
  assert.equal((await call('GET', `/api/public/quote/${token}`, null, { auth: false })).status, 404, 'declined quotes are no longer viewable');
  assert.equal((await call('DELETE', `/api/bookings/${id}`)).status, 200);
  assert.equal((await call('GET', `/api/bookings/${id}`)).status, 404);
});

test('the form can be edited, and extra answers are saved with the booking', async () => {
  const { bookingForm } = (await call('GET', '/api/settings')).body;
  const fields = [...bookingForm.fields.filter((f) => f.id !== 'guests'),
    { id: 'q_genres01', label: 'Which genres?', type: 'choice', options: ['Disco', 'House'], required: true }];
  assert.equal((await call('PUT', '/api/settings/bookingForm', { fields: fields.filter((f) => f.id !== 'client_email') })).status, 400);
  assert.equal((await call('PUT', '/api/settings/bookingForm', { fields })).status, 200);
  const form = (await call('GET', '/api/public/form', null, { auth: false })).body;
  assert.ok(!form.fields.some((f) => f.id === 'guests'));
  assert.deepEqual(form.fields.at(-1).options, [{ value: 'Disco', label: 'Disco' }, { value: 'House', label: 'House' }]);

  const { guests, ...noGuests } = enquiry;
  assert.equal((await call('POST', '/api/public/enquiry', { ...noGuests, client_name: 'Form Tester' }, { auth: false, ip: '10.0.0.9' })).status, 400, 'genres required');
  assert.equal((await call('POST', '/api/public/enquiry', { ...noGuests, client_name: 'Form Tester', q_genres01: 'House' }, { auth: false, ip: '10.0.0.9' })).status, 200);
  const b = (await call('GET', '/api/bookings?status=new')).body.bookings.find((x) => x.client_name === 'Form Tester');
  const full = (await call('GET', `/api/bookings/${b.id}`)).body;
  assert.deepEqual(full.answers, [{ id: 'q_genres01', question: 'Which genres?', answer: 'House' }]);
  assert.equal(full.guests, null);
});
