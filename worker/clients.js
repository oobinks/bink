// Finds the client profile for someone (by email first, then by name), creating one if
// they're new. Missing details on an existing profile are filled in; nothing is overwritten.
import { now } from './db.js';

const FIELDS = ['email', 'phone', 'address', 'instagram'];

export async function linkClient(db, details) {
  const name = String(details.name ?? '').trim();
  if (!name) return null;
  const email = details.email ? String(details.email).trim() : null;
  let c = email
    ? await db.prepare('SELECT * FROM clients WHERE lower(email) = lower(?) ORDER BY id LIMIT 1').bind(email).first()
    : null;
  if (!c) c = await db.prepare('SELECT * FROM clients WHERE lower(name) = lower(?) ORDER BY id LIMIT 1').bind(name).first();

  if (c) {
    const fill = FIELDS.filter((k) => !c[k] && details[k]);
    if (fill.length) {
      await db.prepare(`UPDATE clients SET ${fill.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
        .bind(...fill.map((k) => details[k]), now(), c.id).run();
    }
    return c.id;
  }
  const ts = now();
  const res = await db.prepare(`INSERT INTO clients (name, email, phone, address, instagram, is_sample, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(name, email, details.phone || null, details.address || null, details.instagram || null, details.is_sample ? 1 : 0, ts, ts).run();
  return res.meta.last_row_id;
}
