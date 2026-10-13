// Phase 6: press pack — pick photos and clips, public /epk page only when switched on, nothing private leaks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8802;
const base = `http://127.0.0.1:${PORT}`;
let proc;
let cookie = '';

before(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-press-'));
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

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const anon = (url) => fetch(base + url);

async function upload(bytes, extra) {
  const start = await call('POST', '/api/clips/upload', { size: bytes.length, ...extra });
  assert.equal(start.status, 200);
  const res = await fetch(`${base}/api/clips/${start.body.id}/part?n=1`, { method: 'PUT', headers: { cookie }, body: bytes });
  const done = await call('POST', `/api/clips/${start.body.id}/complete`, { parts: [await res.json()] });
  assert.equal(done.status, 200);
  return start.body.id;
}

let photo;
let video;
let privateClip;

test('the press pack is off until you switch it on', async () => {
  assert.equal((await anon('/api/public/press')).status, 404);
  assert.equal((await anon('/api/clips/press')).status, 401, 'the editing side needs a login');
});

test('photos uploaded from the press pack go straight on it; other clips can be added', async () => {
  photo = await upload(new Uint8Array(3000).fill(1), { file_name: 'press shot.jpg', content_type: 'image/jpeg', press: true });
  video = await upload(new Uint8Array(5000).fill(2), { file_name: 'IMG_1.MOV', content_type: 'video/quicktime' });
  privateClip = await upload(new Uint8Array(4000).fill(3), { file_name: 'IMG_2.MOV', content_type: 'video/quicktime' });
  assert.equal((await call('GET', `/api/clips/${photo}`)).body.status, 'library');
  const hub = (await call('GET', '/api/clips')).body;
  assert.ok(!hub.toReview.some((c) => c.id === photo), "press photos don't land in star-or-bin");

  assert.equal((await call('PATCH', `/api/clips/${video}`, { in_press: true })).status, 200);
  const press = (await call('GET', '/api/clips/press')).body;
  assert.deepEqual(press.items.map((c) => c.id), [photo, video]);
  assert.ok(press.others.some((c) => c.id === privateClip));
  // Sample clips have no file, so they can't be added.
  const sample = (await call('GET', '/api/clips')).body.starred.find((c) => c.is_sample);
  assert.equal((await call('PATCH', `/api/clips/${sample.id}`, { in_press: true })).status, 400);

  await call('POST', '/api/clips/press/order', { ids: [video, photo] });
  assert.deepEqual((await call('GET', '/api/clips/press')).body.items.map((c) => c.id), [video, photo]);
  assert.ok((await call('GET', '/api/settings/activity')).body.some((a) => a.action === 'Added to press pack'));
  // Starred items jump to the top, whatever the order.
  await call('PATCH', `/api/clips/${photo}`, { press_star: true });
  assert.deepEqual((await call('GET', '/api/clips/press')).body.items.map((c) => c.id), [photo, video]);
  await call('PATCH', `/api/clips/${photo}`, { press_star: false });
});

test('switched on, the public page shows your details and only the chosen media', async () => {
  const saved = await call('PUT', '/api/settings/press', { live: true, bio: 'Feel good house.', playedAt: ['Neon Rooms', ' '], instagram: '@ctrinn' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.playedAt, ['Neon Rooms']);
  const res = await anon('/api/public/press');
  assert.equal(res.status, 200);
  const page = await res.json();
  assert.equal(page.djName, 'ctrinn');
  assert.equal(page.bio, 'Feel good house.');
  assert.deepEqual(page.links, { instagram: '@ctrinn' });
  assert.equal(page.phone, null, 'phone hidden unless you choose to show it');
  assert.deepEqual(page.media.map((m) => [m.id, m.kind]), [[video, 'video'], [photo, 'photo']]);
  assert.equal(JSON.stringify(page).includes('bank'), false);

  const file = await anon(`/api/public/press/media/${photo}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/jpeg');
  assert.equal((await file.arrayBuffer()).byteLength, 3000);
  assert.equal((await anon(`/api/public/press/media/${video}`)).status, 200);
  assert.equal((await anon(`/api/public/press/media/${privateClip}`)).status, 404, "clips you didn't choose stay private");
  assert.equal((await anon(`/api/clips/${privateClip}/file`)).status, 401);

  await call('PATCH', `/api/clips/${photo}`, { press_star: true });
  assert.deepEqual((await (await anon('/api/public/press')).json()).media.map((m) => m.id), [photo, video], 'starred first');
  await call('PUT', '/api/settings/press', { showPhone: true });
  assert.equal((await (await anon('/api/public/press')).json()).phone, '07818543677');
});

test('the landing page shows public details only, and the press pack link only when it is on', async () => {
  const home = await (await anon('/api/public/home')).json();
  assert.equal(home.djName, 'ctrinn');
  assert.equal(home.pressLive, true);
  assert.equal(home.coverId, photo, 'starred press photo is the background');
  assert.deepEqual(home.links, { instagram: '@ctrinn' });
  assert.equal(JSON.stringify(home).includes('bank'), false);
});

test('removing a clip or switching the page off takes it down', async () => {
  await call('PATCH', `/api/clips/${video}`, { in_press: false });
  assert.equal((await anon(`/api/public/press/media/${video}`)).status, 404);
  await call('PUT', '/api/settings/press', { live: false });
  assert.equal((await anon('/api/public/press')).status, 404);
  assert.equal((await anon(`/api/public/press/media/${photo}`)).status, 404);
  const home = await (await anon('/api/public/home')).json();
  assert.equal(home.pressLive, false);
  assert.equal(home.coverId, null);
});
