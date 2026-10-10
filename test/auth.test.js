// Checks the login lock: only a genuine Cloudflare Access pass for your email gets in.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { identify } from '../worker/auth.js';

const DOMAIN = 'ctrinn.cloudflareaccess.com';
const env = { ACCESS_TEAM_DOMAIN: DOMAIN, OWNER_EMAILS: 'ctrinn.music@gmail.com' };
let good;
let rogue;

before(async () => {
  good = await generateKeyPair('RS256');
  rogue = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  // Pretend to be Cloudflare's public key server.
  globalThis.fetch = async (url) => {
    assert.equal(String(url), `https://${DOMAIN}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } });
  };
});

const token = (key, claims = {}, iss = `https://${DOMAIN}`) =>
  new SignJWT({ email: 'ctrinn.music@gmail.com', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setIssuedAt().setExpirationTime('1h').sign(key);

const req = (jwt, host = 'ctrinn-hq.example.workers.dev') =>
  new Request(`https://${host}/api/me`, { headers: jwt ? { 'cf-access-jwt-assertion': jwt } : {} });

test('stays locked until a password or Access is configured', async () => {
  assert.deepEqual(await identify(req(), {}), { setupNeeded: true });
});

test('dev shortcut only works on this computer, never on the web address', async () => {
  assert.deepEqual(await identify(req(null, 'localhost:8787'), { DEV_BYPASS_AUTH: '1' }), { email: 'dev@localhost' });
  assert.deepEqual(await identify(req(), { DEV_BYPASS_AUTH: '1' }), { setupNeeded: true });
  assert.equal(await identify(req(), { ...env, DEV_BYPASS_AUTH: '1' }), null);
});

test('no pass = no entry', async () => {
  assert.equal(await identify(req(), env), null);
});

test('a genuine pass for your email gets in', async () => {
  assert.deepEqual(await identify(req(await token(good.privateKey)), env), { email: 'ctrinn.music@gmail.com' });
});

test('a genuine pass for someone else is refused', async () => {
  assert.equal(await identify(req(await token(good.privateKey, { email: 'someone@else.com' })), env), null);
});

test('a forged pass is refused', async () => {
  assert.equal(await identify(req(await token(rogue.privateKey)), env), null);
  assert.equal(await identify(req(await token(good.privateKey, {}, 'https://evil.cloudflareaccess.com')), env), null);
  assert.equal(await identify(req('not-a-token'), env), null);
});
