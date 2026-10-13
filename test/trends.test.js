// Trends: each note shows only with enough data, and says the right thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrends } from '../worker/trends.js';

const today = '2026-10-13';
const gig = (event_date, extra = {}) => ({ status: 'completed', kind: 'party', client_id: null, client_name: 'Someone', event_type: 'Birthday',
  event_date, price_pence: 40000, extras: '[]', created_at: '2026-01-01T10:00:00Z', ...extra });
const byId = (list) => Object.fromEntries(list.map((t) => [t.id, t]));

test('no data: nothing to say, no crash', () => {
  assert.deepEqual(buildTrends({ today, payments: [], bookings: [], invoices: [], clips: [] }), []);
});

test('income up, quiet month, a client to get back in touch with, slow payers, idle clips', () => {
  const t = byId(buildTrends({
    today,
    payments: [{ date: '2026-09-01', pence: 120000 }, { date: '2026-05-01', pence: 80000 }],
    bookings: [
      gig('2025-10-20', { client_id: 7, client_name: 'Laura Kemp', event_type: '30th birthday' }),
      gig('2025-11-14'), gig('2025-11-21'),
      gig('2026-10-31', { status: 'confirmed' }),
    ],
    invoices: [
      { client_name: 'Copper Bar', status: 'paid', sent_at: '2026-03-01', paid_at: '2026-03-25', due_date: '2026-03-08' },
      { client_name: 'Copper Bar', status: 'paid', sent_at: '2026-05-01', paid_at: '2026-05-21', due_date: '2026-05-08' },
      { client_name: 'Ellie', status: 'paid', sent_at: '2026-06-01', paid_at: '2026-06-04', due_date: '2026-06-08' },
    ],
    clips: [{ status: 'posted', posted_at: '2026-09-01T19:00:00Z' }, { status: 'starred', posted_at: null }],
  }));
  assert.equal(t.income.tone, 'up');
  assert.equal(t.income.title, 'Income is up 50%');
  assert.equal(t['quiet-2026-11'].title, 'November has no gigs booked yet');
  assert.match(t['quiet-2026-11'].detail, /Last November you played 2 gigs/);
  assert.equal(t['again-7'].title, 'Laura Kemp booked you this time last year');
  assert.equal(t['again-7'].link, '/clients/7');
  assert.equal(t['pay-speed'].title, 'Clients pay in 16 days on average');
  assert.match(t['pay-speed'].detail, /2 invoices of the last 3 paid late. Slowest: Copper Bar/);
  assert.match(t.clips.title, /No clips posted for 6 weeks/);
});

test("clients who've booked again since aren't nagged about", () => {
  const t = byId(buildTrends({ today, payments: [], invoices: [], clips: [],
    bookings: [gig('2025-10-20', { client_id: 7, client_name: 'Laura' }), gig('2026-08-01', { client_id: 7, client_name: 'Laura' })] }));
  assert.equal(t['again-7'], undefined);
});

test('wording: plural subjects and big jumps read naturally', () => {
  const created = (d) => ({ ...gig('2027-01-01', { status: 'new' }), created_at: d });
  const t = byId(buildTrends({ today, payments: [], invoices: [], clips: [],
    bookings: [...Array(9)].map(() => created('2026-09-01T10:00:00Z')).concat([created('2026-05-01T10:00:00Z'), created('2026-05-02T10:00:00Z')]) }));
  assert.equal(t.enquiries.title, 'Enquiries have more than doubled');
});

test('small changes read as steady; the average fee and busiest night show with enough gigs', () => {
  const sats = ['2026-05-02', '2026-06-06', '2026-07-04', '2026-08-01', '2026-09-05'];
  const old = ['2025-11-01', '2025-12-06', '2026-01-03'];
  const t = byId(buildTrends({ today, invoices: [], clips: [],
    payments: [{ date: '2026-09-01', pence: 100000 }, { date: '2026-05-01', pence: 95000 }],
    bookings: [...sats.map((d) => gig(d, { price_pence: 50000 })), ...old.map((d) => gig(d, { price_pence: 40000 }))] }));
  assert.equal(t.income.tone, 'steady');
  assert.equal(t.fee.title, 'Your average fee is up to £500');
  assert.equal(t.day.title, 'Saturdays are your busiest night');
});
