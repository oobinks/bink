// Login for one person. Your password is stored scrambled (hashed with scrypt),
// so even someone with the database file can't read it.
import crypto from 'node:crypto';
import { db, now } from './db.js';
import { getSetting, setSetting } from './settings.js';

const COOKIE = 'ctrinn_session';
const SESSION_DAYS = 180; // stay logged in on your phone for 6 months
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const fails = new Map(); // ip -> { count, until }

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

export function hasPassword() {
  return Boolean(getSetting('auth')?.passwordHash);
}

export function setPassword(password) {
  setSetting('auth', { passwordHash: hashPassword(password) });
  // Changing the password logs out every other device.
  db.prepare('DELETE FROM sessions').run();
}

function createSession(req, res) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  db.prepare('INSERT INTO sessions (id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?)')
    .run(id, now(), expires.toISOString(), String(req.headers['user-agent'] || '').slice(0, 200));
  res.cookie(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    expires,
  });
}

export function currentSession(req) {
  const id = req.cookies?.[COOKIE];
  if (!id) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!s || s.expires_at < now()) return null;
  return s;
}

export function requireAuth(req, res, next) {
  if (currentSession(req)) return next();
  res.status(401).json({ error: 'Please log in' });
}

const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;

export function authRoutes(app) {
  app.get('/api/auth/status', (req, res) => {
    res.json({ needsSetup: !hasPassword(), loggedIn: Boolean(currentSession(req)) });
  });

  // First run only: choose your password.
  app.post('/api/auth/setup', (req, res) => {
    if (hasPassword()) return res.status(400).json({ error: 'Password already set' });
    if (!validPassword(req.body.password)) return res.status(400).json({ error: 'Use at least 8 characters' });
    setPassword(req.body.password);
    createSession(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip;
    const f = fails.get(ip);
    if (f && f.until > Date.now()) {
      return res.status(429).json({ error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` });
    }
    if (!hasPassword() || typeof req.body.password !== 'string' ||
        !checkPassword(req.body.password, getSetting('auth').passwordHash)) {
      const count = (f?.count || 0) + 1;
      fails.set(ip, { count, until: count >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : 0 });
      return res.status(401).json({ error: 'Wrong password' });
    }
    fails.delete(ip);
    createSession(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    const id = req.cookies?.[COOKIE];
    if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  app.post('/api/auth/change-password', requireAuth, (req, res) => {
    const { current, next } = req.body;
    if (typeof current !== 'string' || !checkPassword(current, getSetting('auth').passwordHash)) {
      return res.status(400).json({ error: 'Current password is wrong' });
    }
    if (!validPassword(next)) return res.status(400).json({ error: 'Use at least 8 characters' });
    setPassword(next);
    createSession(req, res);
    res.json({ ok: true });
  });
}

export function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
}
