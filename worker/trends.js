// Trends: plain-English notes about what's changing in the business, worked out from your own data.
// Pure function (no database), so it's easy to test. Each trend only shows when there's enough data behind it.
import { quoteTotal } from './booking-fields.js';
import { addDays } from './db.js';

const BOOKED = ['confirmed', 'completed'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pounds = (pence) => `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
const pctChange = (now, before) => Math.round(((now - before) / before) * 100);
const between = (d, from, to) => d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
const avg = (list) => (list.length ? list.reduce((a, x) => a + x, 0) / list.length : 0);
const days = (a, b) => (Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "up" / "down" note comparing two periods, or nothing when the change is too small to matter.
function compare(id, what, now, before, { money = false, min = 1, link, plural: many = false } = {}) {
  const is = many ? 'are' : 'is';
  const has = many ? 'have' : 'has';
  if (before < min && now < min) return null;
  const fmt = money ? pounds : (n) => String(n);
  if (before === 0) {
    return { id, tone: 'up', title: `${capital(what)}: ${fmt(now)} in the last 3 months`, detail: 'Up from nothing in the 3 months before.', link };
  }
  const change = pctChange(now, before);
  if (Math.abs(change) < 15) {
    return { id, tone: 'steady', title: `${capital(what)} ${is} holding steady`, detail: `${fmt(now)} in the last 3 months, about the same as the 3 months before (${fmt(before)}).`, link };
  }
  return {
    id, tone: change > 0 ? 'up' : 'down',
    title: change >= 100 ? `${capital(what)} ${has} more than doubled` : `${capital(what)} ${is} ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}%`,
    detail: `${fmt(now)} in the last 3 months, compared with ${fmt(before)} in the 3 months before.`,
    link,
  };
}

export function buildTrends({ today, payments, bookings, invoices, clips }) {
  const out = [];
  const d90 = addDays(today, -90);
  const d180 = addDays(today, -180);
  const d365 = addDays(today, -365);
  const booked = bookings.filter((b) => BOOKED.includes(b.status) && b.event_date);
  const played = booked.filter((b) => b.event_date < today);

  // 1. Money and gigs: last 3 months against the 3 before.
  const yesterday = addDays(today, -1);
  out.push(compare('income', 'income', sum(payments.filter((p) => between(p.date, d90, today)), (p) => p.pence),
    sum(payments.filter((p) => between(p.date, d180, addDays(d90, -1))), (p) => p.pence), { money: true, min: 1, link: '/analytics' }));
  out.push(compare('gigs', 'gigs played', played.filter((b) => between(b.event_date, d90, yesterday)).length,
    played.filter((b) => between(b.event_date, d180, addDays(d90, -1))).length, { min: 2, link: '/analytics', plural: true }));
  out.push(compare('enquiries', 'enquiries', bookings.filter((b) => b.kind !== 'club' && between(b.created_at, d90, today)).length,
    bookings.filter((b) => b.kind !== 'club' && between(b.created_at, d180, addDays(d90, -1))).length, { min: 2, link: '/bookings', plural: true }));

  // 2. Average fee: last 6 months against the 6 before (needs 3 priced gigs in each).
  const fees = (from, to) => played.filter((b) => between(b.event_date, from, to)).map(quoteTotal).filter((p) => p > 0);
  const feeNow = fees(d180, today);
  const feeBefore = fees(d365, addDays(d180, -1));
  if (feeNow.length >= 3 && feeBefore.length >= 3) {
    const a = avg(feeNow);
    const b = avg(feeBefore);
    const change = pctChange(a, b);
    if (Math.abs(change) >= 5) {
      out.push({ id: 'fee', tone: change > 0 ? 'up' : 'down', title: `Your average fee is ${change > 0 ? 'up' : 'down'} to ${pounds(a)}`,
        detail: `Over the last 6 months, compared with ${pounds(b)} in the 6 months before.`, link: '/analytics' });
    }
  }

  // 3. How many enquiries turn into bookings (last 6 months, at least 5 enquiries).
  const enq = bookings.filter((b) => b.kind !== 'club' && between(b.created_at, d180, today) && b.status !== 'new');
  if (enq.length >= 5) {
    const won = enq.filter((b) => BOOKED.includes(b.status)).length;
    const rate = Math.round((won / enq.length) * 100);
    out.push({ id: 'conversion', tone: rate >= 50 ? 'up' : 'idea', title: `${rate}% of enquiries become bookings`,
      detail: rate >= 50 ? `${won} of the last ${enq.length} enquiries you replied to booked. Nice.`
        : `${won} of the last ${enq.length} enquiries booked. Replying faster or adding a photo or clip to the quote can help.`,
      link: '/bookings' });
  }

  // 4. What earns most (last 12 months).
  const year = booked.filter((b) => between(b.event_date, d365, today));
  const byType = {};
  for (const b of year) {
    const t = capital((b.event_type || '').trim() || (b.kind === 'club' ? 'Club set' : 'Other'));
    byType[t] ??= { name: t, pence: 0, gigs: 0 };
    byType[t].pence += quoteTotal(b);
    byType[t].gigs += 1;
  }
  const types = Object.values(byType).sort((a, b) => b.pence - a.pence);
  if (types.length >= 2 && types[0].pence > 0) {
    const top = types[0];
    out.push({ id: 'top-type', tone: 'idea', title: `${top.name} earned you the most this year`,
      detail: `${pounds(top.pence)} from ${plural(top.gigs, 'gig')}, about ${pounds(top.pence / top.gigs)} each.`, link: '/analytics' });
  }

  // 5. Club sets against private parties (when you do both).
  const clubPence = sum(year.filter((b) => b.kind === 'club'), quoteTotal);
  const partyPence = sum(year.filter((b) => b.kind !== 'club'), quoteTotal);
  if (clubPence > 0 && partyPence > 0) {
    const clubShare = Math.round((clubPence / (clubPence + partyPence)) * 100);
    out.push({ id: 'club-party', tone: 'steady', title: `Private parties bring in ${100 - clubShare}% of your gig money`,
      detail: `Club sets make up the other ${clubShare}% (${pounds(clubPence)} against ${pounds(partyPence)} from parties, over 12 months).` });
  }

  // 6. Busiest night (last 12 months, at least 5 gigs).
  if (year.length >= 5) {
    const counts = Array(7).fill(0);
    for (const b of year) counts[new Date(b.event_date + 'T12:00:00Z').getUTCDay()] += 1;
    const top = counts.indexOf(Math.max(...counts));
    out.push({ id: 'day', tone: 'steady', title: `${DAYS[top]}s are your busiest night`,
      detail: `${Math.round((counts[top] / year.length) * 100)}% of your gigs in the last 12 months.` });
  }

  // 7. How far ahead people book (last 6 months vs the 6 before, at least 3 bookings each).
  const lead = (from, to) => booked.filter((b) => b.kind !== 'club' && between(b.created_at, from, to)).map((b) => days(b.created_at, b.event_date)).filter((n) => n >= 0);
  const leadNow = lead(d180, today);
  const leadBefore = lead(d365, addDays(d180, -1));
  if (leadNow.length >= 3 && leadBefore.length >= 3) {
    const a = Math.round(avg(leadNow) / 7);
    const b = Math.round(avg(leadBefore) / 7);
    if (Math.abs(a - b) >= 2) {
      out.push({ id: 'lead', tone: 'idea', title: `People are booking ${a > b ? 'further ahead' : 'later'}`,
        detail: `About ${plural(a, 'week')} before the event now, compared with ${plural(b, 'week')} before.` });
    }
  }

  // 8. Quiet months coming up: the next 3 months with nothing booked yet (once there's some history).
  const [y, m] = today.split('-').map(Number);
  for (let i = 1; i <= (booked.length >= 3 ? 3 : 0); i++) {
    const mm = ((m - 1 + i) % 12) + 1;
    const yy = y + Math.floor((m - 1 + i) / 12);
    const key = `${yy}-${String(mm).padStart(2, '0')}`;
    const lastYear = `${yy - 1}-${String(mm).padStart(2, '0')}`;
    const now = booked.filter((b) => b.event_date.startsWith(key)).length;
    const then = booked.filter((b) => b.event_date.startsWith(lastYear)).length;
    if (now === 0) {
      out.push({ id: `quiet-${key}`, tone: 'idea', title: `${MONTHS[mm - 1]} has no gigs booked yet`,
        detail: then ? `Last ${MONTHS[mm - 1]} you played ${plural(then, 'gig')}. Worth sharing your booking form or posting some clips.`
          : 'Worth sharing your booking form or posting some clips.', link: '/bookings' });
      break; // one nudge is enough
    }
  }

  // 9. Clients who booked around this time last year and haven't since: a good moment to get in touch.
  const anniversaries = [];
  const seen = new Set();
  for (const b of booked) {
    if (!between(b.event_date, addDays(today, -395), addDays(today, -320))) continue;
    const key = b.client_id || b.client_name;
    if (seen.has(key)) continue;
    if (booked.some((x) => (x.client_id || x.client_name) === key && x.event_date > b.event_date)) continue;
    seen.add(key);
    anniversaries.push(b);
  }
  for (const b of anniversaries.slice(0, 3)) {
    const when = new Date(b.event_date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    out.push({ id: `again-${b.client_id || b.client_name}`, tone: 'idea', title: `${b.client_name} booked you this time last year`,
      detail: `${b.event_type || 'A gig'} on ${when}. A good moment to get in touch about this year.`,
      link: b.client_id ? `/clients/${b.client_id}` : '/clients' });
  }

  // 10. How quickly clients pay (invoices paid in the last 12 months, at least 3).
  const paid = invoices.filter((i) => i.status === 'paid' && i.sent_at && i.paid_at && between(i.paid_at, d365, today) && days(i.sent_at, i.paid_at) >= 0);
  if (paid.length >= 3) {
    const avgDays = Math.round(avg(paid.map((i) => days(i.sent_at, i.paid_at))));
    const late = paid.filter((i) => i.paid_at.slice(0, 10) > i.due_date).length;
    const byClient = {};
    for (const i of paid) (byClient[i.client_name] ??= []).push(days(i.sent_at, i.paid_at));
    const slowest = Object.entries(byClient).filter(([, d]) => d.length >= 2).map(([name, d]) => [name, Math.round(avg(d))]).sort((a, b) => b[1] - a[1])[0];
    out.push({ id: 'pay-speed', tone: late > paid.length / 3 ? 'down' : 'steady', title: `Clients pay in ${plural(avgDays, 'day')} on average`,
      detail: `${late ? `${plural(late, 'invoice')} of the last ${paid.length} paid late.` : `All of the last ${paid.length} paid on time.`}${slowest && slowest[1] > avgDays + 3 ? ` Slowest: ${slowest[0]} (about ${slowest[1]} days).` : ''}`,
      link: '/invoices' });
  }

  // 11. Clips: gone quiet on posting while you have starred clips waiting.
  const lastPosted = clips.filter((c) => c.posted_at).map((c) => c.posted_at.slice(0, 10)).sort().at(-1);
  const waiting = clips.filter((c) => c.status === 'starred').length;
  if (waiting && (!lastPosted || days(lastPosted, today) >= 14)) {
    out.push({ id: 'clips', tone: 'idea', title: lastPosted ? `No clips posted for ${Math.floor(days(lastPosted, today) / 7)} weeks` : 'No clips posted yet',
      detail: `You have ${plural(waiting, 'starred clip')} ready to go. Posting keeps you in front of people who book.`, link: '/content' });
  }

  return out.filter(Boolean);
}
