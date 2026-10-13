// Analytics: the numbers behind the Analytics screen. Pure functions, so they're easy to test.
import { quoteTotal } from './booking-fields.js';

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (iso) => iso.slice(0, 7);
const BOOKED = ['confirmed', 'completed'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The dates a period covers. Tax years run 6 April to 5 April.
export function periodRange(period, today) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (period === 'tax') {
    const start = today.slice(5) >= '04-06' ? y : y - 1;
    return { from: `${start}-04-06`, to: `${start + 1}-04-05`, label: `${start}-${pad((start + 1) % 100)} tax year` };
  }
  if (period === 'all') return { from: '0000-01-01', to: '9999-12-31', label: 'All time' };
  const fromY = m === 12 ? y : y - 1;
  const fromM = m === 12 ? 1 : m + 1;
  return { from: `${fromY}-${pad(fromM)}-01`, to: `${y}-${pad(m)}-31`, label: 'Last 12 months' };
}

// Every month between two YYYY-MM keys, inclusive.
function monthsBetween(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const inRange = (d, { from, to }) => d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;

// payments: [{ date, pence }]  bookings: rows from the bookings table  clients: { id: name }
export function buildAnalytics({ period, today, payments, bookings, clipsPosted }) {
  const range = periodRange(period, today);
  const paid = payments.filter((p) => inRange(p.date, range));
  const gigs = bookings.filter((b) => BOOKED.includes(b.status) && inRange(b.event_date, range));
  const played = gigs.filter((b) => b.event_date < today);
  const enquiries = bookings.filter((b) => inRange(b.created_at, range));

  // Months on the charts: the whole tax year, the last 12 months, or (all time) every year with data.
  const dates = [...paid.map((p) => p.date), ...gigs.map((g) => g.event_date)].filter(Boolean).sort();
  let buckets;
  let bucketOf;
  if (period === 'all') {
    const first = Number((dates[0] || today).slice(0, 4));
    const last = Math.max(Number(today.slice(0, 4)), Number((dates.at(-1) || today).slice(0, 4)));
    buckets = Array.from({ length: last - first + 1 }, (_, i) => String(first + i));
    bucketOf = (d) => d.slice(0, 4);
  } else {
    buckets = monthsBetween(monthKey(range.from), monthKey(range.to));
    bucketOf = monthKey;
  }
  const series = (rows, dateOf, valueOf) => {
    const totals = Object.fromEntries(buckets.map((k) => [k, 0]));
    for (const r of rows) {
      const k = bucketOf(dateOf(r));
      if (k in totals) totals[k] += valueOf(r);
    }
    return buckets.map((k) => ({ key: k, value: totals[k] }));
  };

  const aheadSeries = series(gigs.filter((g) => g.event_date >= today), (g) => g.event_date, () => 1);
  const fees = played.map(quoteTotal).filter((p) => p > 0);
  const byType = {};
  for (const g of gigs) {
    const t = (g.event_type || '').trim() || 'Other';
    const name = t.charAt(0).toUpperCase() + t.slice(1);
    byType[name] ??= { name, gigs: 0, pence: 0 };
    byType[name].gigs += 1;
    byType[name].pence += quoteTotal(g);
  }
  let types = Object.values(byType).sort((a, b) => b.pence - a.pence || b.gigs - a.gigs);
  if (types.length > 6) {
    const rest = types.slice(5);
    types = [...types.slice(0, 5), { name: 'Everything else', gigs: rest.reduce((a, t) => a + t.gigs, 0), pence: rest.reduce((a, t) => a + t.pence, 0) }];
  }

  const days = DAYS.map((name) => ({ name, gigs: 0 }));
  for (const g of gigs) days[(new Date(g.event_date + 'T12:00:00Z').getUTCDay() + 6) % 7].gigs += 1;

  const quoted = enquiries.filter((b) => b.quote_sent_at || ['quoted', ...BOOKED].includes(b.status));
  const booked = enquiries.filter((b) => BOOKED.includes(b.status));
  const leadDays = booked.filter((b) => b.event_date).map((b) => (Date.parse(b.event_date) - Date.parse(b.created_at.slice(0, 10))) / 864e5);

  // Clients: who paid most, and how many came back.
  const byClient = {};
  for (const p of paid) {
    if (!p.client) continue;
    byClient[p.client] ??= { name: p.client, pence: 0, gigs: 0 };
    byClient[p.client].pence += p.pence;
  }
  const allGigsByClient = {};
  for (const b of bookings.filter((x) => BOOKED.includes(x.status))) {
    const k = b.client_name?.trim().toLowerCase();
    if (k) allGigsByClient[k] = (allGigsByClient[k] || 0) + 1;
  }
  for (const c of Object.values(byClient)) c.gigs = allGigsByClient[c.name.trim().toLowerCase()] || 0;
  const gigClients = [...new Set(gigs.map((g) => g.client_name?.trim().toLowerCase()).filter(Boolean))];

  return {
    period,
    label: range.label,
    from: range.from,
    to: range.to,
    incomePence: paid.reduce((a, p) => a + p.pence, 0),
    gigsPlayed: played.length,
    gigsAhead: gigs.length - played.length,
    averageFeePence: fees.length ? Math.round(fees.reduce((a, f) => a + f, 0) / fees.length) : 0,
    income: series(paid, (p) => p.date, (p) => p.pence),
    // Each bar: gigs played, plus gigs still to come ("ahead").
    gigsByMonth: series(gigs, (g) => g.event_date, () => 1).map((b, i) => ({ ...b, ahead: aheadSeries[i].value })),
    types,
    days,
    funnel: { enquiries: enquiries.length, quoted: quoted.length, booked: booked.length },
    fromForm: enquiries.filter((b) => b.source === 'form').length,
    leadDays: leadDays.length ? Math.round(leadDays.reduce((a, d) => a + d, 0) / leadDays.length) : null,
    topClients: Object.values(byClient).sort((a, b) => b.pence - a.pence).slice(0, 5),
    repeatClients: { returning: gigClients.filter((k) => allGigsByClient[k] > 1).length, total: gigClients.length },
    clipsPosted,
    bucket: period === 'all' ? 'year' : 'month',
  };
}
