// Realistic pretend data so you can see the app working before using it for real.
// Everything here is marked is_sample = 1 and can be removed in one tap in Settings.
import { db, now, todayUK, addDays } from './db.js';

const T = todayUK();
const d = (n) => addDays(T, n);

const bookings = [
  // New enquiries
  { status: 'new', source: 'form', client_name: 'Hannah Pearce', client_email: 'hannah.pearce@example.com', client_phone: '07700 900123',
    event_date: d(47), start_time: '19:30', end_time: '00:00', venue_name: 'Down Hall Hotel', venue_address: 'Hatfield Heath, Bishop\'s Stortford',
    event_type: 'Wedding', budget_pence: 75000, notes: 'Evening reception, ~120 guests. Love Motown + disco. First dance: "September".', created: -0 },
  { status: 'new', source: 'form', client_name: 'Jake Whitmore', client_email: 'jake@thecrowncollective.example', client_phone: '07700 900456',
    event_date: d(19), start_time: '21:00', end_time: '02:00', venue_name: 'The Crown Collective', venue_address: 'Chelmsford',
    event_type: 'Bar / club night', budget_pence: 30000, notes: 'Looking for a resident Saturday DJ, funky + tech house.', created: -1 },
  // Quoted
  { status: 'quoted', source: 'form', client_name: 'Priya Shah', client_email: 'priya.shah@example.com', client_phone: '07700 900789',
    event_date: d(33), start_time: '20:00', end_time: '23:30', venue_name: 'Private residence', venue_address: 'Harlow',
    event_type: '40th birthday', budget_pence: 40000, notes: 'Garden marquee, 80 guests, 90s + old school classics.', price_pence: 42500,
    extras: [{ label: 'Travel', pence: 2500 }], created: -6 },
  // Confirmed upcoming
  { status: 'confirmed', source: 'manual', client_name: 'Sophie & Tom Reynolds', client_email: 'sophie.reynolds@example.com',
    event_date: d(0), start_time: '19:00', end_time: '23:59', venue_name: 'Gaynes Park', venue_address: 'Epping',
    event_type: 'Wedding', price_pence: 85000, extras: [{ label: 'Extra hour', pence: 10000 }], created: -60 },
  { status: 'confirmed', source: 'manual', client_name: 'Neon Rooms', client_email: 'bookings@neonrooms.example',
    event_date: d(6), start_time: '22:00', end_time: '03:00', venue_name: 'Neon Rooms', venue_address: 'Southend-on-Sea',
    event_type: 'Club night', price_pence: 35000, created: -20 },
  { status: 'confirmed', source: 'form', client_name: 'Marcus Bell', client_email: 'marcus.bell@example.com',
    event_date: d(13), start_time: '20:00', end_time: '00:00', venue_name: 'The Fox & Hounds', venue_address: 'Sawbridgeworth',
    event_type: 'Pub party', price_pence: 25000, created: -14 },
  { status: 'confirmed', source: 'manual', client_name: 'Lakeside Rooftop', client_email: 'events@lakesiderooftop.example',
    event_date: d(20), start_time: '15:00', end_time: '21:00', venue_name: 'Lakeside Rooftop', venue_address: 'Thurrock',
    event_type: 'Day party', price_pence: 40000, created: -25 },
  // Past gigs
  { status: 'completed', source: 'manual', client_name: 'Neon Rooms', client_email: 'bookings@neonrooms.example',
    event_date: d(-1), start_time: '22:00', end_time: '03:00', venue_name: 'Neon Rooms', venue_address: 'Southend-on-Sea',
    event_type: 'Club night', price_pence: 35000, created: -30 },
  { status: 'completed', source: 'manual', client_name: 'Ellie Watson', client_email: 'ellie.w@example.com',
    event_date: d(-8), start_time: '19:00', end_time: '23:00', venue_name: 'The Barn at Harlow', venue_address: 'Harlow',
    event_type: '30th birthday', price_pence: 38000, created: -40 },
  { status: 'completed', source: 'manual', client_name: 'Copper Bar Bishop\'s Stortford', client_email: 'manager@copperbar.example',
    event_date: d(-15), start_time: '21:00', end_time: '01:00', venue_name: 'Copper Bar', venue_address: 'Bishop\'s Stortford',
    event_type: 'Bar night', price_pence: 28000, created: -45 },
  { status: 'completed', source: 'manual', client_name: 'Laura Kemp', client_email: 'laura.kemp@example.com',
    event_date: d(-24), start_time: '19:30', end_time: '00:00', venue_name: 'Down Hall Hotel', venue_address: 'Hatfield Heath',
    event_type: 'Wedding', price_pence: 80000, created: -120 },
  // Declined
  { status: 'declined', source: 'form', client_name: 'Dan Fisher', client_email: 'dan.fisher@example.com',
    event_date: d(13), venue_name: 'Village hall', venue_address: 'Ongar', event_type: 'Christening', budget_pence: 12000,
    notes: 'Clashes with Fox & Hounds booking.', created: -10 },
];

export function loadSampleData() {
  const insB = db.prepare(`INSERT INTO bookings
    (status, source, client_name, client_email, client_phone, event_date, start_time, end_time, venue_name, venue_address,
     event_type, budget_pence, notes, price_pence, extras, seen_at, is_sample, created_at, updated_at)
    VALUES (@status, @source, @client_name, @client_email, @client_phone, @event_date, @start_time, @end_time, @venue_name,
     @venue_address, @event_type, @budget_pence, @notes, @price_pence, @extras, @seen_at, 1, @created_at, @created_at)`);
  const insI = db.prepare(`INSERT INTO invoices
    (number, booking_id, client_name, client_email, issue_date, due_date, items, total_pence, status, sent_at, paid_at, is_sample, created_at, updated_at)
    VALUES (@number, @booking_id, @client_name, @client_email, @issue_date, @due_date, @items, @total_pence, @status, @sent_at, @paid_at, 1, @ts, @ts)`);
  const insC = db.prepare(`INSERT INTO clips (booking_id, file_name, status, caption, hashtags, scheduled_at, posted_at, is_sample, created_at, updated_at)
    VALUES (@booking_id, @file_name, @status, @caption, @hashtags, @scheduled_at, @posted_at, 1, @ts, @ts)`);

  db.transaction(() => {
    const ids = {};
    for (const b of bookings) {
      const created = new Date(Date.now() + b.created * 86400000).toISOString();
      const r = insB.run({
        client_phone: null, start_time: null, end_time: null, budget_pence: null, notes: null, price_pence: null,
        ...b, extras: JSON.stringify(b.extras || []), seen_at: b.status === 'new' ? null : created, created_at: created,
      });
      ids[`${b.client_name}|${b.event_date}`] = r.lastInsertRowid;
    }
    const id = (name, offset) => ids[`${name}|${d(offset)}`];
    const ts = now();
    const inv = (n, bookingName, offset, email, issue, total, status, extra = {}) => insI.run({
      number: `SAMPLE-${String(n).padStart(3, '0')}`, booking_id: id(bookingName, offset), client_name: bookingName, client_email: email,
      issue_date: d(issue), due_date: d(issue + 7), items: JSON.stringify([{ description: 'DJ performance', pence: total }]),
      total_pence: total, status, sent_at: status !== 'draft' ? d(issue) : null, paid_at: null, ts, ...extra,
    });
    inv(1, 'Laura Kemp', -24, 'laura.kemp@example.com', -23, 80000, 'paid', { paid_at: d(-19) + 'T10:00:00Z' });
    inv(2, 'Copper Bar Bishop\'s Stortford', -15, 'manager@copperbar.example', -14, 28000, 'sent'); // overdue
    inv(3, 'Ellie Watson', -8, 'ellie.w@example.com', -6, 38000, 'sent'); // due tomorrow
    // Neon Rooms (last night) deliberately has no invoice yet.

    const neon = id('Neon Rooms', -1);
    const clip = (file_name, status, extra = {}) => insC.run({
      booking_id: neon, file_name, status, caption: null, hashtags: null, scheduled_at: null, posted_at: null, ts, ...extra,
    });
    clip('sample-neon-1.mp4', 'starred');
    clip('sample-neon-2.mp4', 'starred');
    clip('sample-neon-3.mp4', 'starred');
    clip('sample-neon-4.mp4', 'scheduled', { caption: 'Saturday night at Neon Rooms 🪩', hashtags: '#funkyhouse #southend #housemusic',
      scheduled_at: d(0) + 'T18:30:00' });
    clip('sample-neon-5.mp4', 'scheduled', { caption: 'That disco edit 🔥', hashtags: '#disco #essexdj',
      scheduled_at: d(2) + 'T19:00:00' });
    clip('sample-copper-1.mp4', 'posted', { booking_id: id('Copper Bar Bishop\'s Stortford', -15), caption: 'Copper Bar 🍸',
      posted_at: d(-12) + 'T19:00:00Z' });
  })();
}

export function clearSampleData() {
  db.transaction(() => {
    db.prepare('DELETE FROM clips WHERE is_sample = 1').run();
    db.prepare('DELETE FROM invoices WHERE is_sample = 1').run();
    db.prepare('DELETE FROM bookings WHERE is_sample = 1').run();
  })();
}

export function hasSampleData() {
  return Boolean(db.prepare('SELECT 1 FROM bookings WHERE is_sample = 1 LIMIT 1').get());
}
