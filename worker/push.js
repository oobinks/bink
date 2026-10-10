// Phone notifications (Web Push), built on the browser's standard so no
// extra service or account is needed. The app makes its own keys the first
// time it's used and keeps them in the database.
//
// Encryption follows RFC 8291 (aes128gcm) and sign-in to the push service
// follows RFC 8292 (VAPID). Everything uses the built-in WebCrypto.
import { getSetting, setSetting } from './settings.js';
import { now } from './db.js';

const enc = new TextEncoder();
export const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

export async function getVapid(db) {
  let v = await getSetting(db, 'vapid');
  if (!v) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = {
      publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
      privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    };
    await setSetting(db, 'vapid', v);
  }
  return v;
}

async function vapidHeader(vapid, endpoint, subject) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject,
  })));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export async function encryptPayload(sub, payload) {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce },
    aes, concat(enc.encode(payload), new Uint8Array([2]))));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// Sends { title, body, url } to every device that turned notifications on.
export async function notify(env, message) {
  const db = env.DB;
  const subs = (await db.prepare('SELECT * FROM push_subscriptions').all()).results;
  if (!subs.length) return 0;
  const vapid = await getVapid(db);
  const business = await getSetting(db, 'business');
  let sent = 0;
  for (const sub of subs) {
    try {
      const body = await encryptPayload(sub, JSON.stringify(message));
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidHeader(vapid, sub.endpoint, `mailto:${business.email}`),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: '86400',
          Urgency: 'high',
        },
        body,
      });
      if (res.status === 404 || res.status === 410) {
        // That device has turned notifications off or been reset.
        await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
      } else if (res.ok) sent++;
    } catch (err) {
      console.error('Push failed', err);
    }
  }
  return sent;
}

export async function saveSubscription(db, sub, userAgent) {
  const endpoint = String(sub?.endpoint || '');
  const { p256dh, auth } = sub?.keys || {};
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new Error('That device could not be set up for notifications');
  await db.prepare(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`)
    .bind(endpoint, p256dh, auth, String(userAgent || '').slice(0, 200), now()).run();
}
