// Ask: answers come back, and suggested changes become safe confirm buttons (checked against real data).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseReply } from '../worker/ask.js';

const PORT = 8804;
const base = `http://127.0.0.1:${PORT}`;
let proc;
let cookie = '';

before(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-ask-'));
  proc = spawn('npx', ['wrangler', 'dev', '--env', 'test', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state,
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
// The offline stand-in replies with the JSON we "ask", so we can check what the app does with an AI reply.
const ask = (reply, history) => call('POST', '/api/ask', { question: JSON.stringify(reply), history });

let booking;
let invoice;

test('ask is private, and needs a question', async () => {
  assert.equal((await fetch(base + '/api/ask', { method: 'POST' })).status, 401);
  assert.equal((await call('POST', '/api/ask', { question: '  ' })).status, 400);
  const r = await call('POST', '/api/ask', { question: 'Who owes me money?' });
  assert.equal(r.status, 200);
  assert.equal(r.body.answer, 'You asked: Who owes me money?');
  assert.deepEqual(r.body.actions, []);
});

test('"re-open this quote" becomes a confirm button that really re-opens it', async () => {
  booking = (await call('POST', '/api/bookings', { client_name: 'Jess Carter', event_type: '30th birthday', event_date: '2026-11-14' })).body.id;
  await call('POST', `/api/bookings/${booking}/status`, { status: 'declined' });
  const r = await ask({ answer: 'It was declined on 14 Oct. Tap the button to confirm.', actions: [{ type: 'booking_status', booking, status: 'quoted' }] });
  assert.equal(r.status, 200);
  const [a] = r.body.actions;
  assert.equal(a.label, 'Re-open Jess Carter (30th birthday, 14 Nov) as Quoted');
  assert.deepEqual([a.kind, a.method, a.path, a.body], ['do', 'POST', `/bookings/${booking}/status`, { status: 'quoted' }]);
  // Nothing has changed until the button is tapped.
  assert.equal((await call('GET', `/api/bookings/${booking}`)).body.status, 'declined');
  await call(a.method, `/api${a.path}`, a.body);
  assert.equal((await call('GET', `/api/bookings/${booking}`)).body.status, 'quoted');
});

test("suggestions that don't match real data are dropped", async () => {
  const r = await ask({ answer: 'x', actions: [
    { type: 'booking_status', booking: 99999, status: 'quoted' }, // no such booking
    { type: 'booking_status', booking, status: 'quoted' }, // already quoted
    { type: 'booking_status', booking, status: 'deleted' }, // not a real status
    { type: 'delete_everything' },
    { type: 'open_booking', booking },
  ] });
  assert.deepEqual(r.body.actions.map((a) => [a.kind, a.label, a.link]), [['open', 'Open Jess Carter (30th birthday, 14 Nov)', `/bookings/${booking}`]]);
});

test('invoice suggestions: mark paid and pause reminders', async () => {
  invoice = (await call('POST', '/api/invoices', { client_name: 'Copper Bar', items: [{ description: 'DJ set', pence: 28000 }] })).body.id;
  const r = await ask({ answer: 'ok', actions: [{ type: 'invoice_paid', invoice, paid: true }, { type: 'invoice_reminders', invoice, paused: true }] });
  assert.equal(r.body.actions.length, 2);
  assert.match(r.body.actions[0].label, /^Mark CT-\d+ \(Copper Bar, £280\) as paid$/);
  assert.match(r.body.actions[1].label, /^Pause payment reminders for CT-\d+/);
  assert.equal(r.body.actions[0].path, `/invoices/${invoice}/paid`);
});

test("the AI's reply is read even when it isn't neat JSON", () => {
  assert.deepEqual(parseReply('Sure!\n```json\n{"answer":"Hi","actions":[{"type":"x"}]}\n```'), { answer: 'Hi', actions: [{ type: 'x' }] });
  assert.deepEqual(parseReply('Just some words'), { answer: 'Just some words', actions: [] });
  assert.deepEqual(parseReply({ answer: 'obj', actions: 'nope' }), { answer: 'obj', actions: [] });
});
