import { db } from './db.js';

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
  backups: {
    folder: '',
    keepDays: 30,
    lastBackupAt: null,
    lastBackupError: null,
  },
};

// Private keys never leave the server (never sent to the browser or exported).
const PRIVATE_KEYS = new Set(['auth']);

function merge(defaults, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(defaults)) return saved ?? defaults;
  const out = { ...defaults };
  for (const k of Object.keys(saved)) {
    out[k] = defaults && typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) && defaults[k] !== null
      ? merge(defaults[k], saved[k])
      : saved[k];
  }
  return out;
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  const saved = row ? JSON.parse(row.value) : undefined;
  return key in DEFAULT_SETTINGS ? merge(DEFAULT_SETTINGS[key], saved) : saved;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value));
}

export function getPublicSettings() {
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = getSetting(key);
  return out;
}

export function isPrivateKey(key) {
  return PRIVATE_KEYS.has(key);
}
