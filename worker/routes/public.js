// The only parts of the app anyone can reach without logging in:
// - the booking enquiry form (/book)
// - a quote someone was sent a link to (/q/<secret>), with an Accept button
// - the calendar feed for your phone (/cal/<secret>.ics)
// - the press pack (/epk), only while it's switched on, and only the photos and clips you put on it
// - the landing page (/ when you're not logged in): name, tagline, links to the above, socials and contact
import { Hono } from 'hono';
import { now, todayUK, logActivity, all } from '../db.js';
import { getSetting, setSetting } from '../settings.js';
import { cleanBooking, quoteTotal } from '../booking-fields.js';
import { notify } from '../push.js';
import { shortDate } from '../format.js';
import { identify } from '../auth.js';
import { linkClient } from '../clients.js';
import { describe, readSubmission } from '../form-fields.js';
import { invoiceState } from '../invoice-logic.js';
import { serveClipFile } from '../content.js';

const app = new Hono();
const MAX_PER_HOUR = 5;

async function tooManySubmissions(c) {
  const db = c.env.DB;
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const hour = new Date().toISOString().slice(0, 13);
  const row = await db.prepare(`INSERT INTO public_hits (ip, hour, count) VALUES (?, ?, 1)
    ON CONFLICT(ip, hour) DO UPDATE SET count = count + 1 RETURNING count`).bind(ip, hour).first();
  // Tidy up old counters now and then.
  if (Math.random() < 0.05) await db.prepare('DELETE FROM public_hits WHERE hour < ?').bind(hour).run();
  return row.count > MAX_PER_HOUR;
}

app.get('/form', async (c) => {
  const [form, business] = await Promise.all([getSetting(c.env.DB, 'bookingForm'), getSetting(c.env.DB, 'business')]);
  return c.json({ title: form.title, intro: form.intro, fields: describe(form.fields), djName: business.djName, email: business.email });
});

app.post('/enquiry', async (c) => {
  const input = (await c.req.json().catch(() => null)) || {};
  // A hidden box only robots fill in. Pretend it worked so they move on.
  if (input.website) return c.json({ ok: true });
  if (await tooManySubmissions(c)) return c.json({ error: 'Too many enquiries from here. Please try again later or email us.' }, 429);
  const db = c.env.DB;
  const form = await getSetting(db, 'bookingForm');
  let b;
  let answers;
  try {
    const parts = readSubmission(form.fields, input);
    b = cleanBooking(parts.booking);
    answers = parts.answers;
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
  if (!b.event_date || !b.client_email) return c.json({ error: 'Please answer all the required questions' }, 400);
  if (b.event_date < todayUK()) return c.json({ error: 'The date of your event is in the past' }, 400);
  if (answers.length) b.answers = JSON.stringify(answers);

  b.client_id = await linkClient(db, { name: b.client_name, email: b.client_email, phone: b.client_phone, instagram: b.instagram });
  const ts = now();
  const cols = Object.keys(b);
  const res = await db.prepare(`INSERT INTO bookings (${cols.join(', ')}, status, source, raw_form, created_at, updated_at)
    VALUES (${cols.map(() => '?').join(', ')}, 'new', 'form', ?, ?, ?)`)
    .bind(...cols.map((k) => b[k]), JSON.stringify(input).slice(0, 10000), ts, ts).run();
  const id = res.meta.last_row_id;

  const clash = await db.prepare(`SELECT client_name FROM bookings WHERE status = 'confirmed' AND event_date = ? LIMIT 1`)
    .bind(b.event_date).first();
  await logActivity(db, 'New enquiry from the booking form', `${b.client_name}: ${b.event_type}, ${b.event_date}`);
  c.executionCtx.waitUntil(notify(c.env, {
    title: `New enquiry: ${b.client_name}`,
    body: `${b.event_type} · ${shortDate(b.event_date)} · ${b.venue_name}${clash ? ' ⚠️ date clash' : ''}`,
    url: `/bookings/${id}`,
  }));
  return c.json({ ok: true, message: form.thanks });
});

async function bankDetails(db) {
  const bank = await getSetting(db, 'bank');
  return { accountName: bank.accountName, bankName: bank.bankName, sortCode: bank.sortCode, accountNumber: bank.accountNumber };
}

async function findQuote(db, token) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const b = await db.prepare(`SELECT * FROM bookings WHERE quote_token = ? AND quote_sent_at IS NOT NULL`).bind(token).first();
  return b && b.status !== 'declined' ? b : null;
}

// The landing page: just enough to show the right buttons.
app.get('/home', async (c) => {
  const db = c.env.DB;
  const [press, business] = await Promise.all([getSetting(db, 'press'), getSetting(db, 'business')]);
  const cover = press.live
    ? await db.prepare(`SELECT id FROM clips WHERE in_press = 1 AND r2_key IS NOT NULL AND status != 'uploading'
        AND content_type LIKE 'image/%' ORDER BY press_star DESC, press_order, id LIMIT 1`).first('id')
    : null;
  return c.json({
    djName: business.djName,
    tagline: press.tagline,
    genres: business.genres,
    links: Object.fromEntries(['instagram', 'tiktok', 'soundcloud', 'mixcloud', 'youtube'].map((k) => [k, press[k]]).filter(([, v]) => v)),
    email: business.email,
    phone: press.showPhone ? business.phone : null,
    pressLive: Boolean(press.live),
    coverId: cover ?? null,
  });
});

// The press pack for promoters.
app.get('/press', async (c) => {
  const db = c.env.DB;
  const press = await getSetting(db, 'press');
  if (!press.live) return c.json({ error: 'This press pack is not available right now.' }, 404);
  const business = await getSetting(db, 'business');
  const media = await all(db.prepare(`SELECT id, file_name, content_type, size_bytes FROM clips
    WHERE in_press = 1 AND r2_key IS NOT NULL AND status != 'uploading' ORDER BY press_star DESC, press_order, id`));
  return c.json({
    djName: business.djName,
    tagline: press.tagline,
    bio: press.bio,
    genres: business.genres,
    basedIn: business.baseLocation,
    playedAt: press.playedAt,
    links: Object.fromEntries(['instagram', 'tiktok', 'soundcloud', 'mixcloud', 'youtube'].map((k) => [k, press[k]]).filter(([, v]) => v)),
    rider: press.rider,
    email: business.email,
    phone: press.showPhone ? business.phone : null,
    media: media.map((m) => ({
      id: m.id, kind: m.content_type?.startsWith('image/') ? 'photo' : 'video', contentType: m.content_type, size: m.size_bytes,
      ext: (m.file_name.match(/\.(\w{2,5})$/)?.[1] || '').toLowerCase(),
    })),
  });
});

app.get('/press/media/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  if (!(await getSetting(db, 'press')).live) return c.json({ error: 'Not found' }, 404);
  const clip = await db.prepare(`SELECT id, r2_key, file_name FROM clips WHERE id = ? AND in_press = 1 AND r2_key IS NOT NULL
    AND status != 'uploading'`).bind(Number(c.req.param('id'))).first();
  if (!clip) return c.json({ error: 'Not found' }, 404);
  return serveClipFile(c, clip);
});

app.get('/quote/:token', async (c) => {
  const db = c.env.DB;
  const b = await findQuote(db, c.req.param('token'));
  if (!b) return c.json({ error: 'This quote link is no longer available. Please get in touch.' }, 404);
  const business = await getSetting(db, 'business');
  const items = [{ label: 'DJ Cost', pence: b.price_pence || 0 }, ...JSON.parse(b.extras || '[]')];
  return c.json({
    business: { djName: business.djName, legalName: business.legalName, email: business.email, phone: business.phone, address: business.address },
    vatNote: (await getSetting(db, 'invoicing')).vatNote,
    quoteNumber: `Q-${String(b.id).padStart(4, '0')}`,
    quotedOn: b.quote_sent_at.slice(0, 10),
    client: b.client_name,
    eventType: b.event_type,
    eventDate: b.event_date,
    startTime: b.start_time,
    endTime: b.end_time,
    venue: b.venue_name,
    venueAddress: b.venue_address,
    message: b.quote_message,
    items,
    totalPence: quoteTotal(b),
    accepted: Boolean(b.quote_accepted_at) || ['confirmed', 'completed'].includes(b.status),
    confirmed: ['confirmed', 'completed'].includes(b.status),
    depositPence: b.deposit_pence || 0,
    balancePence: quoteTotal(b) - (b.deposit_pence || 0),
    depositPaid: Boolean(b.deposit_paid_at),
    // Bank details only once they've accepted and a deposit is due.
    bank: b.quote_accepted_at && b.deposit_pence && !b.deposit_paid_at ? await bankDetails(db) : null,
    expired: b.event_date && b.event_date < todayUK(),
  });
});

app.post('/quote/:token/accept', async (c) => {
  const db = c.env.DB;
  const b = await findQuote(db, c.req.param('token'));
  if (!b) return c.json({ error: 'This quote link is no longer available. Please get in touch.' }, 404);
  if (b.quote_accepted_at || b.status !== 'quoted') return c.json({ ok: true });
  if (b.event_date && b.event_date < todayUK()) return c.json({ error: 'This quote has expired. Please get in touch.' }, 400);
  const ts = now();
  const depositDue = b.deposit_pence > 0 && !b.deposit_paid_at;
  // With a deposit to pay, the booking is confirmed once it arrives (you tap "Deposit received").
  await db.prepare(`UPDATE bookings SET status = ?, quote_accepted_at = ?, updated_at = ? WHERE id = ? AND status = 'quoted'`)
    .bind(depositDue ? 'quoted' : 'confirmed', ts, ts, b.id).run();
  const clash = await db.prepare(`SELECT client_name FROM bookings WHERE status = 'confirmed' AND event_date = ? AND id != ? LIMIT 1`)
    .bind(b.event_date, b.id).first();
  await logActivity(db, 'Quote accepted by client', `${b.client_name}: ${b.event_date}${depositDue ? ' (deposit due)' : ''}`);
  if (depositDue) {
    c.executionCtx.waitUntil(notify(c.env, {
      title: `🎉 ${b.client_name} accepted the quote`,
      body: `£${(b.deposit_pence / 100).toFixed(0)} deposit due to secure ${shortDate(b.event_date)}${clash ? ` ⚠️ Clashes with ${clash.client_name}` : ''}. Tap "Deposit received" once it lands.`,
      url: `/bookings/${b.id}`,
    }));
    return c.json({ ok: true });
  }
  c.executionCtx.waitUntil(notify(c.env, {
    title: `🎉 Booked: ${b.client_name} accepted`,
    body: `${b.event_type || 'Gig'} · ${shortDate(b.event_date)}${clash ? ` ⚠️ Clashes with ${clash.client_name}` : ''}. Tap to add it to TimeTree.`,
    url: `/bookings/${b.id}`,
  }));
  return c.json({ ok: true });
});

// An invoice someone was sent (/i/<secret>): the details, how to pay, and a PDF.
app.get('/invoice/:token', async (c) => {
  const db = c.env.DB;
  const token = c.req.param('token');
  if (!/^[0-9a-f]{32}$/.test(token)) return c.json({ error: 'Invoice not found' }, 404);
  const inv = await db.prepare(`SELECT * FROM invoices WHERE token = ? AND status != 'draft'`).bind(token).first();
  if (!inv) return c.json({ error: 'This invoice link is no longer available. Please get in touch.' }, 404);
  // Count it as "viewed" when the client opens it (not when you do).
  const who = await identify(c.req.raw, c.env);
  if (!inv.viewed_at && !(who && !who.setupNeeded)) {
    inv.viewed_at = now();
    await db.prepare('UPDATE invoices SET viewed_at = ? WHERE id = ?').bind(inv.viewed_at, inv.id).run();
    await logActivity(db, `Invoice ${inv.number} viewed by client`, inv.client_name);
  }
  const [business, bank, invoicing] = await Promise.all([getSetting(db, 'business'), getSetting(db, 'bank'), getSetting(db, 'invoicing')]);
  return c.json({
    business: { djName: business.djName, legalName: business.legalName, email: business.email, phone: business.phone, address: business.address },
    bank: { accountName: bank.accountName, bankName: bank.bankName, sortCode: bank.sortCode, accountNumber: bank.accountNumber },
    reference: inv.number,
    vatNote: invoicing.vatNote,
    paymentTermsDays: invoicing.paymentTermsDays,
    number: inv.number,
    client: inv.client_name,
    clientEmail: inv.client_email,
    clientAddress: inv.client_address,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    items: JSON.parse(inv.items || '[]'),
    totalPence: inv.total_pence,
    notes: inv.notes,
    state: invoiceState(inv, todayUK()),
    paidOn: inv.paid_at ? inv.paid_at.slice(0, 10) : null,
  });
});

// ---- Calendar feed (subscribed to from your phone's calendar app) ----

export async function calendarToken(db) {
  let cal = await getSetting(db, 'calendar');
  if (!cal?.token) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    cal = { token: [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('') };
    await setSetting(db, 'calendar', cal);
  }
  return cal.token;
}

const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
const stamp = (date, time) => date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
const nextDay = (date) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export async function calendarFeed(c) {
  const db = c.env.DB;
  const token = c.req.param('file').replace(/\.ics$/, '');
  if (token !== (await calendarToken(db))) return c.text('Not found', 404);
  const gigs = await all(db.prepare(`SELECT * FROM bookings WHERE status IN ('confirmed', 'completed') AND event_date IS NOT NULL
    ORDER BY event_date DESC LIMIT 500`));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ctrinn//DJ HQ//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:ctrinn gigs', 'X-WR-TIMEZONE:Europe/London', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const g of gigs) {
    lines.push('BEGIN:VEVENT', `UID:booking-${g.id}@ctrinn-hq`, `DTSTAMP:${dtstamp}`);
    if (g.start_time) {
      const end = g.end_time || g.start_time;
      // Finishing after midnight means the next day.
      const endDate = end <= g.start_time ? nextDay(g.event_date) : g.event_date;
      lines.push(`DTSTART;TZID=Europe/London:${stamp(g.event_date, g.start_time)}`, `DTEND;TZID=Europe/London:${stamp(endDate, end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${g.event_date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDay(g.event_date).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${icsText(`🎧 ${g.venue_name || g.client_name}${g.event_type ? ` · ${g.event_type}` : ''}`)}`,
      `LOCATION:${icsText([g.venue_name, g.venue_address].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${icsText(`${g.client_name}${g.client_phone ? ` · ${g.client_phone}` : ''}`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // Calendar files want lines of at most 75 characters; longer ones continue on the next line.
  const fold = (l) => l.length <= 74 ? l : l.match(/.{1,73}/gu).join('\r\n ');
  return new Response(lines.map(fold).join('\r\n'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default app;
