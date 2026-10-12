// Phase 5: content hub — upload clips to storage, star/bin, captions, scheduling and "time to post" reminders.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { draftCaption, nextFreeSlots, storageCostPence } from '../worker/content.js';
import { DEFAULT_SETTINGS } from '../worker/settings.js';

const PORT = 8800;
const base = `http://127.0.0.1:${PORT}`;
let proc;
let cookie = '';

before(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-clips-'));
  proc = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state, '--test-scheduled',
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

// Same steps as the app: start, send the pieces, finish.
async function upload(bytes, { bookingId, type = 'video/mp4', name = 'clip.mp4', partSize = 5 * 1024 * 1024 } = {}) {
  const start = await call('POST', '/api/clips/upload', { booking_id: bookingId, file_name: name, content_type: type, size: bytes.length });
  if (start.status !== 200) return start;
  const parts = [];
  for (let i = 0, n = 1; i < bytes.length; i += partSize, n++) {
    const res = await fetch(`${base}/api/clips/${start.body.id}/part?n=${n}`, { method: 'PUT', headers: { cookie }, body: bytes.subarray(i, i + partSize) });
    assert.equal(res.status, 200);
    parts.push(await res.json());
  }
  const done = await call('POST', `/api/clips/${start.body.id}/complete`, { parts });
  assert.equal(done.status, 200);
  return start;
}

let gig;
let clipId;

test('clips are private', async () => {
  assert.equal((await fetch(base + '/api/clips')).status, 401);
  assert.equal((await fetch(base + '/api/clips/1/file')).status, 401);
});

test('a big clip uploads in pieces, plays back with seeking, and shows up to review', async () => {
  gig = (await call('POST', '/api/bookings', { client_name: 'Neon Rooms', venue_name: 'Neon Rooms', event_type: 'Club night', event_date: addDays(today, -1) })).body.id;
  await call('POST', `/api/bookings/${gig}/status`, { status: 'confirmed' });
  const bytes = new Uint8Array(6 * 1024 * 1024 + 123).map((_, i) => i % 251);
  const start = await upload(bytes, { bookingId: gig, name: 'IMG_0420.MOV', type: 'video/quicktime' });
  clipId = start.body.id;
  const file = await fetch(`${base}/api/clips/${clipId}/file`, { headers: { cookie } });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'video/quicktime');
  assert.equal((await file.arrayBuffer()).byteLength, bytes.length);
  const part = await fetch(`${base}/api/clips/${clipId}/file`, { headers: { cookie, range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 100-199/${bytes.length}`);
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), bytes.subarray(100, 200));

  const hub = (await call('GET', '/api/clips')).body;
  const clip = hub.toReview.find((c) => c.id === clipId);
  assert.equal(clip.size_bytes, bytes.length);
  assert.equal(clip.venue_name, 'Neon Rooms');
  assert.match(clip.caption, /Neon Rooms|night|🪩/, 'gets a draft caption from the gig');
  assert.ok(hub.storage.usedBytes >= bytes.length);
  const dash = (await call('GET', '/api/dashboard')).body;
  assert.ok(dash.attention.some((a) => a.link === '/content/review'));
  assert.ok((await call('GET', '/api/clips/gigs')).body.some((g) => g.id === gig && g.clips === 1));
});

test('only videos and photos, and never past the free storage', async () => {
  assert.equal((await call('POST', '/api/clips/upload', { file_name: 'x.zip', content_type: 'application/zip', size: 10 })).status, 400);
  const big = await call('POST', '/api/clips/upload', { file_name: 'x.mp4', content_type: 'video/mp4', size: 3.9e9 });
  assert.equal(big.status, 200);
  const full = await call('POST', '/api/clips/upload', { file_name: 'y.mp4', content_type: 'video/mp4', size: 3.9e9 });
  assert.equal(full.status, 200);
  const over = await call('POST', '/api/clips/upload', { file_name: 'z.mp4', content_type: 'video/mp4', size: 3.9e9 });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /storage is full/);
  // Unfinished uploads don't show anywhere, and binning them frees the space.
  assert.ok(!(await call('GET', '/api/clips')).body.toReview.some((c) => c.id === big.body.id));
  // With the free-storage stop turned off, uploads carry on and the monthly cost shows.
  assert.equal((await call('GET', '/api/clips')).body.storage.costPence, 0);
  await call('PUT', '/api/settings/content', { stopAtFree: false });
  const past = await call('POST', '/api/clips/upload', { file_name: 'z.mp4', content_type: 'video/mp4', size: 3.9e9 });
  assert.equal(past.status, 200);
  const storage = (await call('GET', '/api/clips')).body.storage;
  assert.equal(storage.stopAtFree, false);
  assert.ok(storage.usedBytes > storage.freeBytes && storage.costPence > 0);
  await call('PUT', '/api/settings/content', { stopAtFree: true });
  for (const id of [big.body.id, full.body.id, past.body.id]) assert.equal((await call('DELETE', `/api/clips/${id}`)).status, 200);
  assert.equal((await call('GET', '/api/clips')).body.storage.costPence, 0);
});

test('a photo uploads too', async () => {
  const start = await upload(new Uint8Array(2000).fill(7), { bookingId: gig, type: 'image/jpeg', name: 'crowd.jpg' });
  assert.equal(start.status, 200);
});

test('star, new caption idea, and spread starred clips one a day', async () => {
  assert.equal((await call('PATCH', `/api/clips/${clipId}`, { status: 'starred' })).status, 200);
  const idea = (await call('GET', `/api/clips/${clipId}/caption?n=1`)).body;
  assert.ok(idea.caption && idea.hashtags.includes('#'));
  await call('PATCH', `/api/clips/${clipId}`, { caption: 'That disco edit 🔥', hashtags: '#disco' });
  await call('PUT', '/api/settings/content', { postTime: '18:30' });
  const r = (await call('POST', '/api/clips/spread')).body;
  assert.ok(r.scheduled >= 1);
  const clip = (await call('GET', `/api/clips/${clipId}`)).body;
  assert.equal(clip.status, 'scheduled');
  assert.match(clip.scheduled_at, /T18:30$/);
  assert.equal(clip.caption, 'That disco edit 🔥');
  assert.equal((await call('PUT', '/api/settings/content', { postTime: 'teatime' })).status, 400);
  assert.equal((await call('PATCH', `/api/clips/${clipId}`, { scheduled_at: 'tomorrow' })).status, 400);
});

test('at posting time the hourly job reminds once', async () => {
  await call('PATCH', `/api/clips/${clipId}`, { scheduled_at: `${addDays(today, -1)}T19:00` });
  const res = await fetch(`${base}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('0 * * * *')}`);
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 300));
  const clip = (await call('GET', `/api/clips/${clipId}`)).body;
  assert.ok(clip.reminded_at, 'marked as reminded');
  // Rescheduling means a fresh reminder.
  await call('PATCH', `/api/clips/${clipId}`, { scheduled_at: `${addDays(today, 3)}T19:00` });
  assert.equal((await call('GET', `/api/clips/${clipId}`)).body.reminded_at, null);
});

test('mark as posted, then bin deletes the file', async () => {
  await call('PATCH', `/api/clips/${clipId}`, { status: 'posted' });
  const hub = (await call('GET', '/api/clips')).body;
  assert.ok(hub.posted.some((c) => c.id === clipId && c.posted_at));
  const history = (await call('GET', '/api/settings/activity')).body;
  assert.ok(history.some((h) => h.action === 'Clip posted'));
  assert.equal((await call('DELETE', `/api/clips/${clipId}`)).status, 200);
  assert.equal((await fetch(`${base}/api/clips/${clipId}/file`, { headers: { cookie } })).status, 404);
});

test('caption ideas fill in the gig and skip venue ones when there is no venue', () => {
  const content = DEFAULT_SETTINGS.content;
  const sat = { venue_name: 'Neon Rooms', event_type: 'Club night', event_date: '2026-10-10' };
  assert.equal(draftCaption(sat, content, 0).caption, 'Saturday night at Neon Rooms 🪩');
  for (let n = 0; n < 10; n++) assert.ok(!draftCaption({ event_date: '2026-10-10' }, content, n).caption.includes('{'));
  assert.ok(!draftCaption(null, content, 0).caption.includes('at  '));
});

test('scheduling skips days that already have a post, and today if the time has gone', () => {
  assert.deepEqual(nextFreeSlots(['2026-10-13T19:00'], 3, '19:00', '2026-10-12T20:00'),
    ['2026-10-14T19:00', '2026-10-15T19:00', '2026-10-16T19:00']);
  assert.deepEqual(nextFreeSlots([], 1, '19:00', '2026-10-12T09:00'), ['2026-10-12T19:00']);
});

test('storage cost: free up to 10GB, then about 1p a GB a month', () => {
  assert.equal(storageCostPence(9e9), 0);
  assert.equal(storageCostPence(10e9), 0);
  assert.equal(storageCostPence(20e9), 11.4, '10GB over x $0.015 x 76p');
});
