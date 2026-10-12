// Content hub: upload clips (and photos) after a gig, star or bin them, captions, schedule, reminders.
// Files go to Cloudflare storage (the CLIPS bucket) in pieces, so big videos upload reliably from a phone.
import { Hono } from 'hono';
import { now, nowUK, logActivity, all } from '../db.js';
import {
  draftCaption, nextFreeSlots, contentSettings, storageCostPence, serveClipFile, UPLOAD_LIMIT_BYTES, FREE_BYTES,
} from '../content.js';

const app = new Hono();
const STATUSES = ['new', 'starred', 'scheduled', 'posted', 'library'];
const TIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const MAX_FILE_BYTES = 4 * 1000 ** 3;

const COLS = `c.id, c.booking_id, c.file_name, c.status, c.caption, c.hashtags, c.scheduled_at, c.posted_at, c.reminded_at,
  c.size_bytes, c.content_type, c.is_sample, c.created_at, c.in_press, (c.r2_key IS NOT NULL) AS has_file,
  b.venue_name, b.client_name, b.event_date, b.event_type`;
const FROM = 'FROM clips c LEFT JOIN bookings b ON b.id = c.booking_id';

const usedBytes = (db) => db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS used FROM clips').first('used');
const load = (c) => c.env.DB.prepare(`SELECT c.*, b.venue_name, b.client_name, b.event_date, b.event_type FROM clips c
  LEFT JOIN bookings b ON b.id = c.booking_id WHERE c.id = ?`).bind(Number(c.req.param('id'))).first();
const gigName = (b) => (b ? b.venue_name || b.client_name || 'gig' : 'no gig');

// Everything, grouped the way the content hub shows it.
app.get('/', async (c) => {
  const db = c.env.DB;
  const gig = c.req.query('gig');
  const rows = await all(db.prepare(`SELECT ${COLS} ${FROM} WHERE c.status != 'uploading' ${gig ? 'AND c.booking_id = ?' : ''}
    ORDER BY CASE c.status WHEN 'scheduled' THEN c.scheduled_at END, c.posted_at DESC, c.id DESC LIMIT 500`)
    .bind(...(gig ? [Number(gig)] : [])));
  const used = await usedBytes(db);
  const { stopAtFree } = await contentSettings(db);
  return c.json({
    now: nowUK(),
    toReview: rows.filter((r) => r.status === 'new'),
    scheduled: rows.filter((r) => r.status === 'scheduled'),
    starred: rows.filter((r) => r.status === 'starred'),
    posted: rows.filter((r) => r.status === 'posted').slice(0, 30),
    storage: { usedBytes: used, freeBytes: FREE_BYTES, limitBytes: UPLOAD_LIMIT_BYTES, stopAtFree, costPence: storageCostPence(used) },
  });
});

// Recent gigs to tag uploads to (newest first).
app.get('/gigs', async (c) => c.json(await all(c.env.DB.prepare(`SELECT id, client_name, venue_name, event_date, event_type,
    (SELECT COUNT(*) FROM clips c WHERE c.booking_id = b.id AND c.status != 'uploading') AS clips
  FROM bookings b WHERE status IN ('confirmed', 'completed') AND event_date <= date('now', '+1 day')
  ORDER BY event_date DESC LIMIT 30`))));

// 1. Start an upload: makes the clip and a multi-part upload in storage.
app.post('/upload', async (c) => {
  const db = c.env.DB;
  const input = (await c.req.json().catch(() => null)) || {};
  const size = Math.round(Number(input.size));
  const type = String(input.content_type || '').slice(0, 100);
  if (!/^(video|image)\//.test(type)) return c.json({ error: 'Only videos and photos can be uploaded' }, 400);
  if (!Number.isFinite(size) || size <= 0) return c.json({ error: 'That file looks empty' }, 400);
  if (size > MAX_FILE_BYTES) return c.json({ error: 'That file is over 4GB. Try a shorter clip.' }, 400);
  const content = await contentSettings(db);
  if (content.stopAtFree && (await usedBytes(db)) + size > UPLOAD_LIMIT_BYTES) {
    return c.json({ error: 'Your free storage is full. Bin some old clips first so it stays free, or turn off "Stop uploads at the free 10GB" in Settings → Clips & captions.' }, 400);
  }
  const bookingId = input.booking_id ? Number(input.booking_id) : null;
  const booking = bookingId ? await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first() : null;
  if (bookingId && !booking) return c.json({ error: 'Gig not found' }, 404);
  const name = String(input.file_name || 'clip').replace(/[^\w.\- ]+/g, '').trim().slice(0, 120) || 'clip';
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM clips WHERE booking_id IS ?').bind(bookingId).first('n')) || 0;
  const draft = draftCaption(booking, content, n);
  const ts = now();
  // Uploaded from the press pack screen: goes straight onto it, at the end, and skips star-or-bin.
  const press = input.press ? 1 : 0;
  const order = press ? (await db.prepare('SELECT COALESCE(MAX(press_order), 0) + 1 AS n FROM clips').first('n')) : 0;
  const { meta } = await db.prepare(`INSERT INTO clips (booking_id, file_name, status, caption, hashtags, size_bytes, content_type,
      in_press, press_order, created_at, updated_at)
    VALUES (?, ?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(bookingId, name, draft.caption, draft.hashtags, size, type, press, order, ts, ts).run();
  const id = meta.last_row_id;
  const key = `clips/${id}-${name.replace(/\s+/g, '-')}`;
  const mpu = await c.env.CLIPS.createMultipartUpload(key, { httpMetadata: { contentType: type } });
  await db.prepare('UPDATE clips SET r2_key = ?, upload_id = ? WHERE id = ?').bind(key, mpu.uploadId, id).run();
  return c.json({ id, uploadId: mpu.uploadId });
});

const uploading = async (c) => {
  const clip = await load(c);
  if (!clip || clip.status !== 'uploading') return null;
  return clip;
};

// 2. Send each piece (all the same size except the last).
app.put('/:id{[0-9]+}/part', async (c) => {
  const clip = await uploading(c);
  if (!clip) return c.json({ error: 'Upload not found' }, 404);
  const n = Number(c.req.query('n'));
  if (!Number.isInteger(n) || n < 1 || n > 10000) return c.json({ error: 'Bad piece number' }, 400);
  const part = await c.env.CLIPS.resumeMultipartUpload(clip.r2_key, clip.upload_id).uploadPart(n, c.req.raw.body);
  return c.json({ partNumber: part.partNumber, etag: part.etag });
});

// 3. All pieces sent: join them up. The clip is now ready to review.
app.post('/:id{[0-9]+}/complete', async (c) => {
  const db = c.env.DB;
  const clip = await uploading(c);
  if (!clip) return c.json({ error: 'Upload not found' }, 404);
  const { parts } = (await c.req.json().catch(() => null)) || {};
  if (!Array.isArray(parts) || !parts.length) return c.json({ error: 'No pieces uploaded' }, 400);
  const obj = await c.env.CLIPS.resumeMultipartUpload(clip.r2_key, clip.upload_id)
    .complete(parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })));
  await db.prepare(`UPDATE clips SET status = ?, upload_id = NULL, size_bytes = ?, updated_at = ? WHERE id = ?`)
    .bind(clip.in_press ? 'library' : 'new', obj.size, now(), clip.id).run();
  return c.json({ ok: true });
});

// Log one line per batch rather than per clip.
app.post('/uploaded', async (c) => {
  const { count, booking_id: bookingId } = (await c.req.json().catch(() => null)) || {};
  const b = bookingId ? await c.env.DB.prepare('SELECT venue_name, client_name FROM bookings WHERE id = ?').bind(Number(bookingId)).first() : null;
  await logActivity(c.env.DB, 'Clips uploaded', `${Number(count) || 0} from ${gigName(b)}`);
  return c.json({ ok: true });
});

// The file itself (supports seeking, which phones need to play videos).
app.get('/:id{[0-9]+}/file', async (c) => {
  const clip = await load(c);
  if (!clip?.r2_key || clip.status === 'uploading') return c.json({ error: 'File not found' }, 404);
  return serveClipFile(c, clip);
});

app.get('/:id{[0-9]+}', async (c) => {
  const clip = await c.env.DB.prepare(`SELECT ${COLS} ${FROM} WHERE c.id = ?`).bind(Number(c.req.param('id'))).first();
  if (!clip) return c.json({ error: 'Clip not found' }, 404);
  return c.json(clip);
});

// Another caption idea (n counts up each time you tap).
app.get('/:id{[0-9]+}/caption', async (c) => {
  const clip = await load(c);
  if (!clip) return c.json({ error: 'Clip not found' }, 404);
  return c.json(draftCaption(clip, await contentSettings(c.env.DB), Number(c.req.query('n')) || 0));
});

// Star, bin-undo, caption, schedule or reschedule.
app.patch('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const clip = await load(c);
  if (!clip || clip.status === 'uploading') return c.json({ error: 'Clip not found' }, 404);
  const input = (await c.req.json().catch(() => null)) || {};
  const set = {};
  if ('caption' in input) set.caption = String(input.caption ?? '').trim().slice(0, 2200) || null;
  if ('hashtags' in input) set.hashtags = String(input.hashtags ?? '').trim().slice(0, 1000) || null;
  if ('status' in input) {
    if (!STATUSES.includes(input.status)) return c.json({ error: 'Unknown status' }, 400);
    set.status = input.status;
    set.posted_at = input.status === 'posted' ? now() : null;
    if (input.status !== 'scheduled') set.scheduled_at = null;
    else set.scheduled_at = clip.scheduled_at;
  }
  if ('scheduled_at' in input) {
    if (input.scheduled_at === null || input.scheduled_at === '') {
      set.scheduled_at = null;
      if (clip.status === 'scheduled' && !set.status) set.status = 'starred';
    } else {
      if (!TIME.test(input.scheduled_at)) return c.json({ error: 'Pick a date and time' }, 400);
      set.scheduled_at = input.scheduled_at;
      set.status = 'scheduled';
      set.posted_at = null;
    }
    set.reminded_at = null;
  }
  if ('in_press' in input) {
    set.in_press = input.in_press ? 1 : 0;
    if (set.in_press && !clip.in_press) {
      if (!clip.r2_key) return c.json({ error: 'Only clips with a file can go in the press pack' }, 400);
      set.press_order = await db.prepare('SELECT COALESCE(MAX(press_order), 0) + 1 AS n FROM clips').first('n');
    }
  }
  if (set.status === 'scheduled' && !(set.scheduled_at || clip.scheduled_at)) return c.json({ error: 'Pick a date and time' }, 400);
  const cols = Object.keys(set);
  if (!cols.length) return c.json({ ok: true });
  await db.prepare(`UPDATE clips SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...cols.map((k) => set[k]), now(), clip.id).run();
  if ('in_press' in set && set.in_press !== clip.in_press) {
    await logActivity(db, set.in_press ? 'Added to press pack' : 'Removed from press pack', clip.caption || clip.file_name);
  }
  if (set.status === 'posted') await logActivity(db, 'Clip posted', `${clip.caption || clip.file_name} (${gigName(clip)})`);
  else if (set.status === 'scheduled') await logActivity(db, 'Clip scheduled', `${set.scheduled_at.replace('T', ' ')}: ${clip.caption || clip.file_name}`);
  return c.json({ ok: true });
});

// Spread every starred clip across the coming days, one a day at your posting time.
app.post('/spread', async (c) => {
  const db = c.env.DB;
  const { postTime } = await contentSettings(db);
  const [starred, taken] = await Promise.all([
    all(db.prepare(`SELECT id FROM clips WHERE status = 'starred' ORDER BY booking_id DESC, id`)),
    all(db.prepare(`SELECT scheduled_at FROM clips WHERE status = 'scheduled' AND scheduled_at >= ?`).bind(nowUK().slice(0, 10))),
  ]);
  if (!starred.length) return c.json({ scheduled: 0 });
  const slots = nextFreeSlots(taken.map((t) => t.scheduled_at), starred.length, postTime);
  const ts = now();
  await db.batch(starred.map((s, i) => db.prepare(`UPDATE clips SET status = 'scheduled', scheduled_at = ?, reminded_at = NULL,
    updated_at = ? WHERE id = ?`).bind(slots[i], ts, s.id)));
  await logActivity(db, 'Clips scheduled', `${starred.length} clip(s), ${slots[0].slice(0, 10)} to ${slots.at(-1).slice(0, 10)}`);
  return c.json({ scheduled: starred.length, from: slots[0], to: slots.at(-1) });
});

// The press pack's media (in order), everything else that could go on it, and venue suggestions for "Played at".
app.get('/press', async (c) => {
  const db = c.env.DB;
  const [items, others, venues] = await Promise.all([
    all(db.prepare(`SELECT ${COLS} ${FROM} WHERE c.in_press = 1 AND c.r2_key IS NOT NULL AND c.status != 'uploading'
      ORDER BY c.press_order, c.id`)),
    all(db.prepare(`SELECT ${COLS} ${FROM} WHERE c.in_press = 0 AND c.r2_key IS NOT NULL AND c.status != 'uploading'
      ORDER BY CASE c.status WHEN 'new' THEN 1 ELSE 0 END, c.id DESC LIMIT 200`)),
    all(db.prepare(`SELECT venue_name, MAX(event_date) AS last FROM bookings
      WHERE status IN ('confirmed', 'completed') AND is_sample = 0 AND venue_name IS NOT NULL AND trim(venue_name) != ''
        AND event_date <= ? GROUP BY lower(trim(venue_name)) ORDER BY last DESC LIMIT 40`).bind(nowUK().slice(0, 10))),
  ]);
  return c.json({ items, others, venues: venues.map((v) => v.venue_name.trim()) });
});

// New order for the press pack, e.g. after moving a photo to the top.
app.post('/press/order', async (c) => {
  const db = c.env.DB;
  const { ids } = (await c.req.json().catch(() => null)) || {};
  if (!Array.isArray(ids) || ids.length > 500) return c.json({ error: 'Send the clips in order' }, 400);
  await db.batch(ids.map((id, i) => db.prepare('UPDATE clips SET press_order = ? WHERE id = ? AND in_press = 1').bind(i + 1, Number(id))));
  return c.json({ ok: true });
});

// Bin: the file is deleted from storage too, freeing up space.
app.delete('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const clip = await load(c);
  if (!clip) return c.json({ error: 'Clip not found' }, 404);
  await removeFile(c.env, clip);
  await db.prepare('DELETE FROM clips WHERE id = ?').bind(clip.id).run();
  if (clip.status !== 'new' && clip.status !== 'uploading') await logActivity(db, 'Clip deleted', `${clip.caption || clip.file_name} (${gigName(clip)})`);
  return c.json({ ok: true });
});

async function removeFile(env, clip) {
  if (!clip.r2_key || !env.CLIPS) return;
  if (clip.upload_id) await env.CLIPS.resumeMultipartUpload(clip.r2_key, clip.upload_id).abort().catch(() => {});
  else await env.CLIPS.delete(clip.r2_key);
}

// Nightly: tidy up uploads that never finished (e.g. the phone lost signal).
export async function cleanStaleUploads(env) {
  const stale = await all(env.DB.prepare(`SELECT id, r2_key, upload_id FROM clips WHERE status = 'uploading' AND created_at < ?`)
    .bind(new Date(Date.now() - 86400000).toISOString()));
  for (const clip of stale) {
    await removeFile(env, clip);
    await env.DB.prepare('DELETE FROM clips WHERE id = ?').bind(clip.id).run();
  }
  return stale.length;
}

export default app;
