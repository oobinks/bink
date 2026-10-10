// Who's allowed in? Two ways, checked in this order:
//
// 1. Your own password (the default, completely free, no card needed).
//    Set it in the Cloudflare dashboard → your Worker → Settings →
//    Variables and Secrets → add a *Secret* called APP_PASSWORD.
//    Cloudflare keeps it encrypted; it is never stored in the code or database.
//
// 2. Cloudflare Access (optional extra lock). If ACCESS_TEAM_DOMAIN and
//    OWNER_EMAILS are set, every request must also carry a valid Access pass.
//
// With neither set, the app stays locked and shows "Almost there".
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { now } from './db.js';

const COOKIE = 'djhq_session';
const SESSION_DAYS = 180; // stay logged in on your phone for 6 months
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD = 10;

let jwks;
let jwksDomain;

const isLocal = (url) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';

function teamDomain(env) {
  return String(env.ACCESS_TEAM_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export function authMode(env) {
  if (teamDomain(env) && env.OWNER_EMAILS) return 'access';
  if (env.APP_PASSWORD) return 'password';
  return 'setup';
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compares two strings without leaking how much of them matched.
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

async function verifyAccess(request, env) {
  const domain = teamDomain(env);
  const owners = String(env.OWNER_EMAILS).toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;
  if (jwksDomain !== domain) {
    jwks = createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`));
    jwksDomain = domain;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${domain}`,
      ...(env.ACCESS_AUD ? { audience: env.ACCESS_AUD } : {}),
    });
    const email = String(payload.email || '').toLowerCase();
    return owners.includes(email) ? { email } : null;
  } catch {
    return null;
  }
}

async function verifySession(request, env) {
  const id = readCookie(request, COOKIE);
  if (!id || !env.DB) return null;
  const row = await env.DB.prepare('SELECT expires_at FROM sessions WHERE id_hash = ?').bind(await sha256(id)).first();
  if (!row || row.expires_at < now()) return null;
  return { email: 'you' };
}

export async function identify(request, env) {
  const url = new URL(request.url);
  // Local development only: never honoured on the real web address.
  if (env.DEV_BYPASS_AUTH === '1' && isLocal(url)) return { email: 'dev@localhost' };

  const mode = authMode(env);
  if (mode === 'setup') return { setupNeeded: true };
  if (mode === 'access') {
    const who = await verifyAccess(request, env);
    // If a password is also set, both locks must be passed.
    if (!who || !env.APP_PASSWORD) return who;
    return (await verifySession(request, env)) ? who : null;
  }
  return verifySession(request, env);
}

export function requireAuth() {
  return async (c, next) => {
    const who = await identify(c.req.raw, c.env);
    if (who?.setupNeeded) return c.json({ error: 'setup', message: 'Finish setup: add your APP_PASSWORD in Cloudflare' }, 503);
    if (!who) return c.json({ error: 'Please log in' }, 401);
    c.set('user', who);
    await next();
  };
}

function sessionCookie(request, value, maxAgeSeconds) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function authRoutes(app) {
  app.get('/api/auth/status', async (c) => {
    const who = await identify(c.req.raw, c.env);
    return c.json({ mode: authMode(c.env), loggedIn: Boolean(who && !who.setupNeeded) });
  });

  app.post('/api/auth/login', async (c) => {
    const env = c.env;
    if (!env.APP_PASSWORD) return c.json({ error: 'No password has been set up yet' }, 400);
    if (env.APP_PASSWORD.length < MIN_PASSWORD) {
      return c.json({ error: `Your APP_PASSWORD in Cloudflare is too short. Use at least ${MIN_PASSWORD} characters.` }, 400);
    }
    const ip = c.req.header('cf-connecting-ip') || 'local';
    const f = await env.DB.prepare('SELECT count, until FROM login_attempts WHERE ip = ?').bind(ip).first();
    if (f && f.until > now()) return c.json({ error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` }, 429);

    const { password } = await c.req.json().catch(() => ({}));
    if (typeof password !== 'string' || !(await sameSecret(password, env.APP_PASSWORD))) {
      // Count failures since the last success or lock-out.
      const count = (f && !f.until ? f.count : 0) + 1;
      const until = count >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : '';
      await env.DB.prepare(`INSERT INTO login_attempts (ip, count, until) VALUES (?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET count = excluded.count, until = excluded.until`)
        .bind(ip, count >= MAX_FAILS ? 0 : count, until).run();
      return c.json({ error: 'Wrong password' }, 401);
    }

    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
      env.DB.prepare('INSERT INTO sessions (id_hash, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?)')
        .bind(await sha256(id), now(), expires, String(c.req.header('user-agent') || '').slice(0, 200)),
    ]);
    c.header('Set-Cookie', sessionCookie(c.req.raw, id, SESSION_DAYS * 86400));
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', async (c) => {
    const id = readCookie(c.req.raw, COOKIE);
    if (id) await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(id)).run();
    c.header('Set-Cookie', sessionCookie(c.req.raw, '', 0));
    return c.json({ ok: true });
  });

  // Logs out every device (e.g. after losing your phone).
  app.post('/api/auth/logout-everywhere', requireAuth(), async (c) => {
    await c.env.DB.prepare('DELETE FROM sessions').run();
    c.header('Set-Cookie', sessionCookie(c.req.raw, '', 0));
    return c.json({ ok: true });
  });
}
