import { DEFAULT_FIELDS, cleanFields } from './form-fields.js';

// Everything in here is editable on the Settings screen.
export const DEFAULT_SETTINGS = {
  business: {
    djName: 'ctrinn',
    legalName: 'ctrinn',
    address: 'Sawbridgeworth, Hertfordshire',
    email: 'ctrinn.music@gmail.com',
    phone: '07818543677',
    genres: ['Feel good house', 'Funky house', 'Old school classics', 'Disco', 'Tech house'],
    baseLocation: 'Essex, UK',
  },
  bank: {
    accountName: '',
    bankName: '',
    sortCode: '',
    accountNumber: '',
    reference: 'Use your invoice number',
  },
  invoicing: {
    currency: 'GBP',
    paymentTermsDays: 7,
    vatRegistered: false,
    vatNote: 'Not VAT registered — no VAT is charged.',
    numberPrefix: 'CT-',
    nextNumber: 1,
  },
  // Prices are in pence. These are placeholders until ctrinn sets real ones.
  pricing: {
    presets: [
      { name: 'Private party (4 hours)', pence: 35000 },
      { name: 'Wedding (evening)', pence: 65000 },
      { name: 'Bar / club set', pence: 25000 },
    ],
    extraHourPence: 5000,
    equipmentPence: 10000,
    travelPerMilePence: 45,
    freeMiles: 20,
    depositPence: 10000, // paid to secure the date; the balance is paid on the night
  },
  bookingForm: {
    title: 'Private Party Booking Enquiry',
    intro: 'Please fill out the below form to enquire for your upcoming private party!\nWe aim to get in touch within 24 to 48 hours after your request.\n\nThank you!',
    thanks: "Thanks! Your enquiry has been sent. We'll be in touch within 24 to 48 hours.",
    fields: DEFAULT_FIELDS, // the questions, in order (edit them in Settings → Booking form)
  },
  // Email wording. {placeholders} are filled in for each invoice.
  emails: {
    invoiceSubject: 'Invoice {number} from {dj_name}',
    invoiceBody: 'Hi {first_name},\n\nThanks so much for having me at {event}! Here\'s your invoice {number} for {amount}. It\'s attached, and you can also view it online:\n{link}\n\nPayment is due by {due_date}. The bank details are on the invoice.\n\nThanks,\n{dj_name}',
    chaseOn: true,
    steps: [
      { days: -2, on: true, subject: 'Friendly reminder: invoice {number} is due on {due_date}',
        body: 'Hi {first_name},\n\nJust a quick heads-up that invoice {number} for {amount} is due on {due_date}.\n\nYou can view it and the bank details here:\n{link}\n\nThanks again,\n{dj_name}' },
      { days: 0, on: true, subject: 'Invoice {number} is due today',
        body: 'Hi {first_name},\n\nA gentle reminder that invoice {number} for {amount} is due today.\n\n{link}\n\nIf you\'ve already paid, thank you, and please ignore this.\n\n{dj_name}' },
      { days: 7, on: true, subject: 'Invoice {number}: payment reminder',
        body: 'Hi {first_name},\n\nI hope you\'re well! I haven\'t received payment yet for invoice {number} ({amount}), which was due on {due_date}. Could you take a look when you get a moment?\n\n{link}\n\nIf you\'ve already paid, thank you, and please ignore this.\n\n{dj_name}' },
      { days: 14, on: true, subject: 'Invoice {number} is now 2 weeks overdue',
        body: 'Hi {first_name},\n\nInvoice {number} for {amount} is now two weeks overdue (it was due on {due_date}). Please could you let me know when I can expect payment?\n\n{link}\n\nThanks,\n{dj_name}' },
    ],
  },
  // Content hub: draft captions and when clips get scheduled.
  content: {
    postTime: '19:00',
    hashtags: '#housemusic #funkyhouse #disco #essexdj #djlife',
    // {venue}, {event} and {night} (e.g. "Saturday night") are filled in from the gig.
    captions: [
      '{night} at {venue} 🪩',
      'This is what {night}s are made for 🔥',
      '{event} vibes at {venue} ✨',
      'Still thinking about this one 🎧 {venue}',
      'Feel good house, all night long 🕺',
      'When the drop hits just right 🙌',
      'Thank you {venue}, what a night 🖤',
    ],
  },
  backups: {
    lastBackupAt: null,
    lastBackupError: null,
  },
};

function merge(defaults, saved) {
  if (!saved || typeof saved !== 'object') return defaults;
  const out = { ...defaults };
  for (const k of Object.keys(saved)) if (k in defaults) out[k] = saved[k];
  return out;
}

export async function getSetting(db, key) {
  const raw = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first('value');
  const saved = raw ? JSON.parse(raw) : undefined;
  return key in DEFAULT_SETTINGS ? merge(DEFAULT_SETTINGS[key], saved) : saved;
}

export async function setSetting(db, key, value) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value)).run();
}

export async function getAllSettings(db) {
  const rows = (await db.prepare('SELECT key, value FROM settings').all()).results;
  const saved = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = merge(DEFAULT_SETTINGS[key], saved[key]);
  return out;
}

// Only known fields can be saved, so typos can't break anything.
const READ_ONLY = { backups: ['lastBackupAt', 'lastBackupError'] };

export function cleanSection(section, input, current) {
  const defaults = DEFAULT_SETTINGS[section];
  const out = { ...current };
  for (const [k, def] of Object.entries(defaults)) {
    if (!(k in input) || READ_ONLY[section]?.includes(k)) continue;
    const v = input[k];
    if (section === 'pricing' && k === 'presets') {
      if (!Array.isArray(v)) throw new Error('Presets must be a list');
      out[k] = v.slice(0, 20).map((p) => {
        const pence = Math.round(Number(p?.pence));
        const name = String(p?.name ?? '').trim().slice(0, 80);
        if (!name) throw new Error('Each preset needs a name');
        if (!Number.isFinite(pence) || pence < 0) throw new Error(`Check the price for "${name}"`);
        return { name, pence };
      });
    } else if (section === 'bookingForm' && k === 'fields') {
      out[k] = cleanFields(v);
    } else if (section === 'emails' && k === 'steps') {
      if (!Array.isArray(v) || v.length !== def.length) throw new Error('Reminder steps are missing');
      out[k] = v.map((st) => {
        const days = Math.round(Number(st?.days));
        if (!Number.isFinite(days) || days < -30 || days > 90) throw new Error('Reminder days must be between -30 and 90');
        const subject = String(st?.subject ?? '').trim().slice(0, 200);
        const body = String(st?.body ?? '').trim().slice(0, 4000);
        if (!subject || !body) throw new Error('Each reminder needs a subject and a message');
        return { days, on: Boolean(st?.on), subject, body };
      });
    } else if (section === 'content' && k === 'postTime') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw new Error('Post time must look like 19:00');
      out[k] = String(v);
    } else if (Array.isArray(def)) {
      if (!Array.isArray(v)) throw new Error(`${k} must be a list`);
      out[k] = v.map((x) => String(x).trim()).filter(Boolean).slice(0, 50);
    } else if (typeof def === 'number') {
      const n = Number(v);
      if (v === '' || !Number.isFinite(n) || n < 0) throw new Error(`${k} must be a positive number`);
      out[k] = Math.round(n);
    } else if (typeof def === 'boolean') {
      out[k] = Boolean(v);
    } else {
      out[k] = String(v ?? '').trim().slice(0, section === 'emails' ? 4000 : 1000);
    }
  }
  return out;
}
