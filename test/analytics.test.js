// Analytics sums: periods, income, gigs, types, enquiries and clients.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalytics, periodRange } from '../worker/analytics.js';

test('periods: tax year runs 6 April to 5 April; last 12 months; all time', () => {
  assert.deepEqual(periodRange('tax', '2026-10-13'), { from: '2026-04-06', to: '2027-04-05', label: '2026-27 tax year' });
  assert.equal(periodRange('tax', '2027-04-05').from, '2026-04-06');
  assert.equal(periodRange('12m', '2026-10-13').from, '2025-11-01');
  assert.equal(periodRange('12m', '2026-12-02').from, '2026-01-01');
  assert.equal(periodRange('all', '2026-10-13').from, '0000-01-01');
});

const bookings = [
  { status: 'completed', source: 'form', client_name: 'Laura Kemp', event_type: 'wedding', event_date: '2026-09-12', price_pence: 65000, extras: '[{"label":"Lights","pence":5000}]', created_at: '2026-05-01T10:00:00Z', quote_sent_at: '2026-05-02' },
  { status: 'completed', source: 'manual', client_name: 'Laura Kemp', event_type: '30th birthday', event_date: '2026-10-03', price_pence: 35000, extras: '[]', created_at: '2026-08-01T10:00:00Z' },
  { status: 'confirmed', source: 'form', client_name: 'Neon Rooms', event_type: 'Club night', event_date: '2026-11-07', price_pence: 25000, extras: '[]', created_at: '2026-09-07T10:00:00Z' },
  { status: 'declined', source: 'form', client_name: 'Tom', event_type: 'Wedding', event_date: '2026-12-01', price_pence: null, extras: '[]', created_at: '2026-10-01T10:00:00Z', quote_sent_at: '2026-10-02' },
  { status: 'new', source: 'form', client_name: 'Amy', event_type: null, event_date: '2027-01-01', price_pence: null, extras: '[]', created_at: '2024-01-01T10:00:00Z' },
];
const payments = [
  { date: '2026-09-13', pence: 60000, client: 'Laura Kemp' },
  { date: '2026-05-10', pence: 10000, client: 'Laura Kemp' },
  { date: '2026-10-04', pence: 35000, client: 'Laura Kemp' },
  { date: '2025-01-04', pence: 99900, client: 'Old Client' },
];

test('the last 12 months add up', () => {
  const a = buildAnalytics({ period: '12m', today: '2026-10-13', payments, bookings, clipsPosted: 3 });
  assert.equal(a.incomePence, 105000, 'paid invoices + deposits in the period only');
  assert.equal(a.income.length, 12);
  assert.equal(a.income.find((m) => m.key === '2026-09').value, 60000);
  assert.equal(a.gigsPlayed, 2);
  assert.equal(a.gigsAhead, 0, 'November is outside the last 12 months');
  assert.equal(a.averageFeePence, 52500, 'average of £700 and £350');
  assert.deepEqual(a.types.map((t) => t.name), ['Wedding', '30th birthday']);
  assert.equal(a.days.find((d) => d.name === 'Sat').gigs, 2);
  assert.deepEqual(a.funnel, { enquiries: 4, quoted: 4, booked: 3 });
  assert.equal(a.fromForm, 3);
  assert.deepEqual(a.topClients[0], { name: 'Laura Kemp', pence: 105000, gigs: 2 });
  assert.deepEqual(a.repeatClients, { returning: 1, total: 1 });
});

test('the tax year includes gigs booked ahead; all time groups by year', () => {
  const tax = buildAnalytics({ period: 'tax', today: '2026-10-13', payments, bookings, clipsPosted: 0 });
  assert.equal(tax.gigsAhead, 1);
  assert.deepEqual(tax.gigsByMonth.find((m) => m.key === '2026-11'), { key: '2026-11', value: 1, ahead: 1 });
  assert.equal(tax.income[0].key, '2026-04');
  const ever = buildAnalytics({ period: 'all', today: '2026-10-13', payments, bookings, clipsPosted: 0 });
  assert.equal(ever.bucket, 'year');
  assert.deepEqual(ever.income.map((y) => y.key), ['2025', '2026']);
  assert.equal(ever.incomePence, 204900);
});

test('no data, no crash', () => {
  const a = buildAnalytics({ period: '12m', today: '2026-10-13', payments: [], bookings: [], clipsPosted: 0 });
  assert.equal(a.averageFeePence, 0);
  assert.equal(a.leadDays, null);
  assert.equal(a.types.length, 0);
});
