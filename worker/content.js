// Content hub rules: draft captions, spreading clips over the coming days, and "time to post" reminders.
import { nowUK, addDays, all, now } from './db.js';
import { getSetting } from './settings.js';
import { notify } from './push.js';

export const FREE_BYTES = 10 * 1000 ** 3; // Cloudflare's free storage
export const UPLOAD_LIMIT_BYTES = 9.5 * 1000 ** 3; // stop a little before it, so it never costs anything
// Cloudflare's price for storage over the free 10GB: $0.015 per GB a month, shown in pence at roughly $1 = 76p.
export const USD_PER_GB_MONTH = 0.015;
export const PENCE_PER_USD = 76;

// What the stored clips cost a month, in pence (can be a fraction of a penny). 0 while under 10GB.
export function storageCostPence(usedBytes) {
  const over = Math.max(0, usedBytes - FREE_BYTES) / 1000 ** 3;
  return Math.round(over * USD_PER_GB_MONTH * PENCE_PER_USD * 100) / 100;
}

const weekday = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

// Caption idea number n for a gig. Ideas that need a venue are skipped when there isn't one.
export function draftCaption(booking, content, n = 0) {
  const venue = (booking?.venue_name || '').trim();
  const fill = {
    venue,
    event: (booking?.event_type || '').trim() || 'Party',
    night: booking?.event_date ? `${weekday(booking.event_date)} night` : 'Last night',
  };
  const usable = (content.captions || []).filter((t) => venue || !t.includes('{venue}'));
  const list = usable.length ? usable : ['🪩'];
  const text = list[((n % list.length) + list.length) % list.length]
    .replace(/\{(\w+)\}/g, (m, k) => (k in fill ? fill[k] : m))
    .replace(/\s{2,}/g, ' ').trim();
  return { caption: text.charAt(0).toUpperCase() + text.slice(1), hashtags: content.hashtags || '' };
}

// The next free days (one post per day) at your posting time, starting today if it's not too late.
export function nextFreeSlots(taken, count, postTime, current = nowUK()) {
  const takenDays = new Set(taken.map((t) => String(t).slice(0, 10)));
  const slots = [];
  let day = current.slice(0, 10);
  if (`${day}T${postTime}` <= current) day = addDays(day, 1);
  while (slots.length < count) {
    if (!takenDays.has(day)) slots.push(`${day}T${postTime}`);
    day = addDays(day, 1);
  }
  return slots;
}

// Hourly: a phone notification for each clip whose posting time has come. Each clip is only reminded once.
export async function clipReminders(env, current = nowUK()) {
  const due = await all(env.DB.prepare(`SELECT c.id, c.caption, b.venue_name, b.client_name FROM clips c
    LEFT JOIN bookings b ON b.id = c.booking_id
    WHERE c.status = 'scheduled' AND c.reminded_at IS NULL AND c.is_sample = 0 AND c.scheduled_at <= ?
    ORDER BY c.scheduled_at`).bind(current));
  if (!due.length) return 0;
  await env.DB.prepare(`UPDATE clips SET reminded_at = ? WHERE id IN (${due.map(() => '?').join(',')})`)
    .bind(now(), ...due.map((c) => c.id)).run();
  const first = due[0];
  await notify(env, due.length === 1
    ? { title: '📲 Time to post', body: `${first.caption || 'Your clip'}${first.venue_name ? ` (${first.venue_name})` : ''}. Tap to share it.`, url: `/content/${first.id}` }
    : { title: `📲 ${due.length} clips to post`, body: 'Tap to share them.', url: '/content' });
  return due.length;
}

export const contentSettings = (db) => getSetting(db, 'content');
