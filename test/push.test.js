// Checks phone notifications are encrypted the way phones expect (RFC 8291),
// by decrypting them again as a phone would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPayload, b64url } from '../worker/push.js';

const enc = new TextEncoder();
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

test('a notification can be decrypted by the receiving phone', async () => {
  // Pretend phone keys.
  const phone = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const phonePublic = new Uint8Array(await crypto.subtle.exportKey('raw', phone.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const message = JSON.stringify({ title: 'New enquiry: Jess', body: '30th · Sat 5 Dec', url: '/bookings/1' });

  const body = await encryptPayload({ p256dh: b64url(phonePublic), auth: b64url(authSecret) }, message);

  // Unpack as a phone would.
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer).getUint32(16);
  const idLen = body[20];
  const serverPublic = body.slice(21, 21 + idLen);
  const cipher = body.slice(21 + idLen);
  assert.equal(rs, 4096);
  assert.equal(idLen, 65);

  const serverKey = await crypto.subtle.importKey('raw', serverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, phone.privateKey, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...phonePublic, ...serverPublic]);
  const ikm = await hkdf(authSecret, shared, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher));

  assert.equal(plain[plain.length - 1], 2, 'ends with the last-record marker');
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), message);
});
