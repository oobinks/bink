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
  },
  bookingForm: {
    title: 'Private Party Booking Enquiry',
    intro: 'Please fill out the below form to enquire for your upcoming private party!\nWe aim to get in touch within 24 to 48 hours after your request.\n\nThank you!',
    thanks: "Thanks! Your enquiry has been sent. We'll be in touch within 24 to 48 hours.",
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
      out[k] = String(v ?? '').trim().slice(0, 1000);
    }
  }
  return out;
}
