// What a booking can contain, and how each field is checked.
// Used by the public booking form, adding an enquiry by hand, and editing.

export const STATUSES = ['new', 'quoted', 'confirmed', 'completed', 'declined'];
export const EQUIPMENT = ['yes', 'no', 'not sure'];
export const CONTACT_METHODS = ['email', 'phone', 'instagram'];

const text = (max) => (v) => {
  const s = String(v ?? '').trim().slice(0, max);
  return s || null;
};
const date = (v) => {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error('Check the date');
  return v;
};
const time = (v) => {
  if (!v) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error('Check the times');
  return v;
};
const whole = (max) => (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error('Check the numbers');
  return n;
};
const oneOf = (list) => (v) => {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (!list.includes(s)) throw new Error('Check your answers');
  return s;
};
const email = (v) => {
  const s = text(200)(v);
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error('Check the email address');
  return s;
};
const instagram = (v) => {
  const s = text(60)(v);
  return s ? '@' + s.replace(/^@+/, '').replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '') : null;
};

export const FIELDS = {
  client_name: text(120),
  client_email: email,
  client_phone: text(40),
  instagram,
  contact_method: oneOf(CONTACT_METHODS),
  event_type: text(120),
  event_date: date,
  start_time: time,
  end_time: time,
  venue_name: text(160),
  venue_address: text(400),
  equipment: oneOf(EQUIPMENT),
  guests: whole(100000),
  budget_pence: whole(100000000),
  notes: text(4000),
};

// The public form's required questions (matching the original Google Form).
const REQUIRED_PUBLIC = ['client_name', 'event_type', 'event_date', 'start_time', 'end_time', 'venue_name',
  'venue_address', 'equipment', 'guests', 'contact_method', 'client_phone', 'client_email'];

export function cleanBooking(input, { partial = false, isPublic = false } = {}) {
  const out = {};
  for (const [k, check] of Object.entries(FIELDS)) {
    if (!(k in input)) continue;
    out[k] = check(input[k]);
  }
  if (isPublic) {
    for (const k of REQUIRED_PUBLIC) {
      if (out[k] === null || out[k] === undefined) throw new Error('Please answer all the required questions');
    }
  } else if (!partial && !out.client_name) {
    throw new Error("Add the client's name");
  }
  if (partial && 'client_name' in out && !out.client_name) throw new Error("The client's name can't be empty");
  return out;
}

// Quote = base price + extras. Extras are [{ label, pence }].
export function cleanExtras(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map((e) => {
    const label = String(e?.label ?? '').trim().slice(0, 80);
    const pence = Math.round(Number(e?.pence));
    if (!label || !Number.isFinite(pence) || pence < 0) throw new Error('Check the extras');
    return { label, pence };
  });
}

export function quoteTotal(b) {
  const extras = typeof b.extras === 'string' ? JSON.parse(b.extras || '[]') : b.extras || [];
  return (b.price_pence || 0) + extras.reduce((a, e) => a + e.pence, 0);
}
