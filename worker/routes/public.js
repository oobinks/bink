// The only parts of the app anyone can reach without logging in:
// - the booking enquiry form (/book)
// - a quote someone was sent a link to (/q/<secret>), with an Accept button
// - the calendar feed for your phone (/cal/<secret>.ics)
import { Hono } from 'hono';
import { now, todayUK, logActivity, all } from '../db.js';
import { getSetting, setSetting } from '../settings.js';
import { cleanBooking, quoteTotal } from '../booking-fields.js';
import { notify } from '../push.js';
import { shortDate } from '../format.js';
import { identify } from '../auth.js';
import { invoiceState } from '../invoice-logic.js';

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
  return c.json({ ...form, djName: business.djName, email: business.email });
});

app.post('/enquiry', async (c) => {
  const input = (await c.req.json().catch(() => null)) || {};
  // A hidden box only robots fill in. Pretend it worked so they move on.
  if (input.website) return c.json({ ok: true });
  if (await tooManySubmissions(c)) return c.json({ error: 'Too many enquiries from here. Please try again later or email us.' }, 429);
  let b;
  try {
    b = cleanBooking(input, { isPublic: true });
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
  if (b.event_date < todayUK()) return c.json({ error: 'The date of your event is in the past' }, 400);

  const db = c.env.DB;
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
  const form = await getSetting(db, 'bookingForm');
  return c.json({ ok: true, message: form.thanks });
});

async function findQuote(db, token) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const b = await db.prepare(`SELECT * FROM bookings WHERE quote_token = ? AND quote_sent_at IS NOT NULL`).bind(token).first();
  return b && b.status !== 'declined' ? b : null;
}

app.get('/quote/:token', async (c) => {
  const db = c.env.DB;
  const b = await findQuote(db, c.req.param('token'));
  if (!b) return c.json({ error: 'This quote link is no longer available. Please get in touch.' }, 404);
  const business = await getSetting(db, 'business');
  const items = [{ label: b.event_type || 'DJ performance', pence: b.price_pence || 0 }, ...JSON.parse(b.extras || '[]')];
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
  await db.prepare(`UPDATE bookings SET status = 'confirmed', quote_accepted_at = ?, updated_at = ? WHERE id = ? AND status = 'quoted'`)
    .bind(ts, ts, b.id).run();
  const clash = await db.prepare(`SELECT client_name FROM bookings WHERE status = 'confirmed' AND event_date = ? AND id != ? LIMIT 1`)
    .bind(b.event_date, b.id).first();
  await logActivity(db, 'Quote accepted by client', `${b.client_name}: ${b.event_date}`);
  c.executionCtx.waitUntil(notify(c.env, {
    title: `🎉 Booked: ${b.client_name} accepted`,
    body: `${b.event_type || 'Gig'} · ${shortDate(b.event_date)}${clash ? ` ⚠️ Clashes with ${clash.client_name}` : ''}`,
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
