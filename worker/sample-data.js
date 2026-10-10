// Realistic pretend data so you can see the app working before using it for real.
// Everything here is marked is_sample = 1 and can be removed in one tap in Settings.
import { now, todayUK, addDays } from './db.js';

const bookings = (d) => [
  // New enquiries
  { status: 'new', source: 'form', client_name: 'Hannah Pearce', client_email: 'hannah.pearce@example.com', client_phone: '07700 900123',
    event_date: d(47), start_time: '19:30', end_time: '00:00', venue_name: 'Down Hall Hotel', venue_address: "Hatfield Heath, Bishop's Stortford",
    event_type: 'Wedding', budget_pence: 75000, notes: 'Evening reception, ~120 guests. Love Motown + disco. First dance: "September".', created: 0 },
  { status: 'new', source: 'form', client_name: 'Jake Whitmore', client_email: 'jake@thecrowncollective.example', client_phone: '07700 900456',
    event_date: d(19), start_time: '21:00', end_time: '02:00', venue_name: 'The Crown Collective', venue_address: 'Chelmsford',
    event_type: 'Bar / club night', budget_pence: 30000, notes: 'Looking for a resident Saturday DJ, funky + tech house.', created: -1 },
  // Quoted
  { status: 'quoted', source: 'form', client_name: 'Priya Shah', client_email: 'priya.shah@example.com', client_phone: '07700 900789',
    event_date: d(33), start_time: '20:00', end_time: '23:30', venue_name: 'Private residence', venue_address: 'Harlow',
    event_type: '40th birthday', budget_pence: 40000, notes: 'Garden marquee, 80 guests, 90s + old school classics.', price_pence: 42500,
    extras: [{ label: 'Travel', pence: 2500 }], created: -6 },
  // Confirmed, upcoming
  { status: 'confirmed', client_name: 'Sophie & Tom Reynolds', client_email: 'sophie.reynolds@example.com',
    event_date: d(0), start_time: '19:00', end_time: '23:59', venue_name: 'Gaynes Park', venue_address: 'Epping',
    event_type: 'Wedding', price_pence: 85000, extras: [{ label: 'Extra hour', pence: 10000 }], created: -60 },
  { status: 'confirmed', client_name: 'Neon Rooms', client_email: 'bookings@neonrooms.example',
    event_date: d(6), start_time: '22:00', end_time: '03:00', venue_name: 'Neon Rooms', venue_address: 'Southend-on-Sea',
    event_type: 'Club night', price_pence: 35000, created: -20 },
  { status: 'confirmed', source: 'form', client_name: 'Marcus Bell', client_email: 'marcus.bell@example.com',
    event_date: d(13), start_time: '20:00', end_time: '00:00', venue_name: 'The Fox & Hounds', venue_address: 'Sawbridgeworth',
    event_type: 'Pub party', price_pence: 25000, created: -14 },
  { status: 'confirmed', client_name: 'Lakeside Rooftop', client_email: 'events@lakesiderooftop.example',
    event_date: d(20), start_time: '15:00', end_time: '21:00', venue_name: 'Lakeside Rooftop', venue_address: 'Thurrock',
    event_type: 'Day party', price_pence: 40000, created: -25 },
  // Past gigs
  { key: 'neon-past', status: 'completed', client_name: 'Neon Rooms', client_email: 'bookings@neonrooms.example',
    event_date: d(-1), start_time: '22:00', end_time: '03:00', venue_name: 'Neon Rooms', venue_address: 'Southend-on-Sea',
    event_type: 'Club night', price_pence: 35000, created: -30 },
  { key: 'ellie', status: 'completed', client_name: 'Ellie Watson', client_email: 'ellie.w@example.com',
    event_date: d(-8), start_time: '19:00', end_time: '23:00', venue_name: 'The Barn at Harlow', venue_address: 'Harlow',
    event_type: '30th birthday', price_pence: 38000, created: -40 },
  { key: 'copper', status: 'completed', client_name: "Copper Bar Bishop's Stortford", client_email: 'manager@copperbar.example',
    event_date: d(-15), start_time: '21:00', end_time: '01:00', venue_name: 'Copper Bar', venue_address: "Bishop's Stortford",
    event_type: 'Bar night', price_pence: 28000, created: -45 },
  { key: 'laura', status: 'completed', client_name: 'Laura Kemp', client_email: 'laura.kemp@example.com',
    event_date: d(-24), start_time: '19:30', end_time: '00:00', venue_name: 'Down Hall Hotel', venue_address: 'Hatfield Heath',
    event_type: 'Wedding', price_pence: 80000, created: -120 },
  // Declined
  { status: 'declined', source: 'form', client_name: 'Dan Fisher', client_email: 'dan.fisher@example.com',
    event_date: d(13), venue_name: 'Village hall', venue_address: 'Ongar', event_type: 'Christening', budget_pence: 12000,
    notes: 'Clashes with Fox & Hounds booking.', created: -10 },
];

const BOOKING_COLS = ['status', 'source', 'client_name', 'client_email', 'client_phone', 'event_date', 'start_time', 'end_time',
  'venue_name', 'venue_address', 'event_type', 'budget_pence', 'notes', 'price_pence', 'extras', 'seen_at', 'created_at', 'updated_at'];

export async function loadSampleData(db) {
  const T = todayUK();
  const d = (n) => addDays(T, n);
  const list = bookings(d);

  const results = await db.batch(list.map((b) => {
    const created = new Date(Date.now() + b.created * 86400000).toISOString();
    const row = {
      source: 'manual', client_phone: null, start_time: null, end_time: null, budget_pence: null, notes: null, price_pence: null,
      ...b, extras: JSON.stringify(b.extras || []), seen_at: b.status === 'new' ? null : created, created_at: created, updated_at: created,
    };
    return db.prepare(`INSERT INTO bookings (${BOOKING_COLS.join(', ')}, is_sample) VALUES (${BOOKING_COLS.map(() => '?').join(', ')}, 1)`)
      .bind(...BOOKING_COLS.map((c) => row[c]));
  }));
  const id = Object.fromEntries(list.map((b, i) => [b.key, results[i].meta.last_row_id]).filter(([k]) => k));

  const ts = now();
  const inv = (n, key, name, email, issue, total, status, paidAt = null) =>
    db.prepare(`INSERT INTO invoices (number, booking_id, client_name, client_email, issue_date, due_date, items, total_pence,
      status, sent_at, paid_at, is_sample, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(`SAMPLE-${String(n).padStart(3, '0')}`, id[key], name, email, d(issue), d(issue + 7),
        JSON.stringify([{ description: 'DJ performance', pence: total }]), total, status, d(issue), paidAt, ts, ts);

  const clip = (bookingId, file, status, caption = null, hashtags = null, scheduledAt = null, postedAt = null) =>
    db.prepare(`INSERT INTO clips (booking_id, file_name, status, caption, hashtags, scheduled_at, posted_at, is_sample, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(bookingId, file, status, caption, hashtags, scheduledAt, postedAt, ts, ts);

  await db.batch([
    inv(1, 'laura', 'Laura Kemp', 'laura.kemp@example.com', -23, 80000, 'paid', d(-19) + 'T10:00:00Z'),
    inv(2, 'copper', "Copper Bar Bishop's Stortford", 'manager@copperbar.example', -14, 28000, 'sent'), // overdue
    inv(3, 'ellie', 'Ellie Watson', 'ellie.w@example.com', -6, 38000, 'sent'), // due tomorrow
    // Last night's Neon Rooms gig deliberately has no invoice yet.
    clip(id['neon-past'], 'sample-neon-1.mp4', 'starred'),
    clip(id['neon-past'], 'sample-neon-2.mp4', 'starred'),
    clip(id['neon-past'], 'sample-neon-3.mp4', 'starred'),
    clip(id['neon-past'], 'sample-neon-4.mp4', 'scheduled', 'Saturday night at Neon Rooms 🪩', '#funkyhouse #southend #housemusic', d(0) + 'T18:30:00'),
    clip(id['neon-past'], 'sample-neon-5.mp4', 'scheduled', 'That disco edit 🔥', '#disco #essexdj', d(2) + 'T19:00:00'),
    clip(id.copper, 'sample-copper-1.mp4', 'posted', 'Copper Bar 🍸', null, null, d(-12) + 'T19:00:00Z'),
  ]);
}

export async function clearSampleData(db) {
  await db.batch([
    db.prepare('DELETE FROM clips WHERE is_sample = 1'),
    db.prepare('DELETE FROM invoices WHERE is_sample = 1'),
    db.prepare('DELETE FROM bookings WHERE is_sample = 1'),
  ]);
}

export async function hasSampleData(db) {
  return Boolean(await db.prepare('SELECT 1 AS x FROM bookings WHERE is_sample = 1 LIMIT 1').first('x'));
}
