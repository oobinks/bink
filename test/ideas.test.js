// Checks "Improve the app" end to end against a pretend GitHub.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8792;
const GH_PORT = 8793;
const base = `http://127.0.0.1:${PORT}`;
const MARKER = '<!-- ctrinn-claude -->';
let proc;
let fake;

// --- A tiny pretend GitHub ---------------------------------------------------
const store = { issues: [], comments: {}, pulls: [], labels: new Set() };
const ts = () => new Date().toISOString();
function ghComment(n, body, assoc = 'OWNER') {
  (store.comments[n] ||= []).push({ id: Date.now() + Math.random(), body, author_association: assoc, created_at: ts() });
}
function startFake() {
  fake = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.replace('/repos/oobinks/bink', '');
    const send = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.headers.authorization !== 'Bearer test-token') return send(401, {});
    let m;
    if (p === '/labels' && req.method === 'POST') {
      if (store.labels.has(body.name)) return send(422, {});
      store.labels.add(body.name); return send(201, {});
    }
    if (p === '/issues' && req.method === 'POST') {
      const issue = { number: store.issues.length + 1, title: body.title, body: body.body, labels: body.labels.map((name) => ({ name })),
        created_at: ts(), updated_at: ts(), comments: 0 };
      store.issues.push(issue); return send(201, issue);
    }
    if (p === '/issues' && req.method === 'GET') return send(200, store.issues);
    if ((m = p.match(/^\/issues\/(\d+)$/))) return send(200, store.issues[m[1] - 1]);
    if ((m = p.match(/^\/issues\/(\d+)\/comments$/))) {
      if (req.method === 'POST') { ghComment(m[1], body.body); return send(201, {}); }
      return send(200, store.comments[m[1]] || []);
    }
    if (p === '/pulls') return send(200, store.pulls.filter((pr) => url.searchParams.get('head') === `oobinks:${pr.head}`));
    send(404, {});
  }).listen(GH_PORT);
}

before(async () => {
  startFake();
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'djhq-ideas-'));
  proc = spawn('npx', ['wrangler', 'dev', '--env', 'test', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state,
    '--var', 'DEV_BYPASS_AUTH:1', '--var', 'GITHUB_TOKEN:test-token', '--var', `GITHUB_API:http://127.0.0.1:${GH_PORT}`],
  { stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) {
    try { await fetch(base + '/'); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('The local simulator did not start');
});

after(() => { process.kill(-proc.pid); fake.close(); });

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('starting an idea opens a labelled GitHub issue and waits for Claude', async () => {
  const r = await call('POST', '/api/ideas', { text: 'Show venue postcodes on the gig list' });
  assert.equal(r.status, 200);
  assert.equal(r.body.number, 1);
  assert.deepEqual(store.issues[0].labels, [{ name: 'app-idea' }]);
  const idea = (await call('GET', '/api/ideas/1')).body;
  assert.equal(idea.status, 'chatting');
  assert.equal(idea.waiting, true);
  assert.equal(idea.messages[0].text, 'Show venue postcodes on the gig list');
});

test("Claude's reply appears; strangers' comments are hidden", async () => {
  ghComment(1, `${MARKER}\n\nGood idea. Full postcode or just the area?`, 'NONE');
  ghComment(1, 'buy my crypto', 'NONE');
  const idea = (await call('GET', '/api/ideas/1')).body;
  assert.equal(idea.waiting, false);
  assert.equal(idea.messages.length, 2);
  assert.equal(idea.messages[1].from, 'claude');
  assert.equal(idea.messages[1].text, 'Good idea. Full postcode or just the area?');
});

test('your messages and button taps are posted', async () => {
  assert.equal((await call('POST', '/api/ideas/1/messages', { text: 'Full postcode' })).status, 200);
  assert.equal((await call('POST', '/api/ideas/1/messages', { text: '/ship' })).status, 400, 'commands only via buttons');
  assert.equal((await call('POST', '/api/ideas/1/action', { action: 'build' })).status, 200);
  assert.equal((await call('POST', '/api/ideas/1/action', { action: 'delete-everything' })).status, 400);
  const idea = (await call('GET', '/api/ideas/1')).body;
  assert.deepEqual(idea.messages.slice(2).map((m) => m.text || m.action), ['Full postcode', 'build']);
  assert.equal(idea.waiting, true);
});

test('when built, the preview link is found on the pull request', async () => {
  store.issues[0].labels.push({ name: 'ready' });
  ghComment(1, `${MARKER}\n\nDone!`, 'NONE');
  store.pulls.push({ number: 2, head: 'idea-1' });
  ghComment(2, 'Deploying with Cloudflare Workers\n| Preview URL | https://idea-1-ctrinn-hq.ctrinn.workers.dev |', 'NONE');
  const idea = (await call('GET', '/api/ideas/1')).body;
  assert.equal(idea.status, 'ready');
  assert.equal(idea.previewUrl, 'https://idea-1-ctrinn-hq.ctrinn.workers.dev');
});

test('ideas list shows status', async () => {
  const list = (await call('GET', '/api/ideas')).body;
  assert.equal(list[0].status, 'ready');
});
