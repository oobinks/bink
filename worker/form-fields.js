// The booking enquiry form is built from a list of questions you can edit in Settings.
// "Core" questions fill in the booking itself (name, date, venue…); your own extra
// questions are saved with the booking as "More answers".
export const TYPES = {
  short: 'Short text',
  long: 'Long text',
  choice: 'Multiple choice (pick one)',
  checkboxes: 'Tick boxes (pick any)',
  dropdown: 'Dropdown',
  number: 'Number',
  date: 'Date',
  time: 'Time',
  email: 'Email',
  phone: 'Phone',
  money: 'Money (£)',
};
const OPTION_TYPES = new Set(['choice', 'checkboxes', 'dropdown']);

// Core questions: their answers go into the booking. Type (and fixed options) can't change.
export const CORE = {
  client_name: { type: 'short', label: 'Full Name', essential: true },
  event_type: { type: 'short', label: 'Occasion', hint: 'Example: 21st Birthday Party' },
  event_date: { type: 'date', label: 'Date of Event', essential: true },
  start_time: { type: 'time', label: 'Start Time' },
  end_time: { type: 'time', label: 'Finish Time' },
  venue_name: { type: 'short', label: 'Location', hint: 'The name of the venue or place' },
  venue_address: { type: 'long', label: 'Event Address', hint: 'Including postcode' },
  equipment: { type: 'choice', label: 'Do you need us to provide speakers, lights & DJ booth?',
    options: [['yes', 'Yes'], ['no', 'No'], ['not sure', 'Not sure']] },
  guests: { type: 'number', label: "Approximate Number of Attendees" },
  contact_method: { type: 'choice', label: 'Best Method of Communication',
    options: [['email', 'Email'], ['phone', 'Phone / Text'], ['instagram', 'Instagram']] },
  client_phone: { type: 'phone', label: 'Phone Number' },
  client_email: { type: 'email', label: 'Email Address', essential: true },
  instagram: { type: 'short', label: 'Instagram Handle', hint: 'Only asked if they pick Instagram above' },
  budget_pence: { type: 'money', label: 'Budget', hint: 'Optional' },
  notes: { type: 'long', label: 'Anything else we should know?', hint: 'Optional: music you love, special requests' },
};

// The form as it was set up from your Google Form.
export const DEFAULT_FIELDS = Object.entries(CORE).map(([id, d]) => ({
  id, label: d.label, hint: d.hint || '', required: !['budget_pence', 'notes', 'instagram'].includes(id),
}));

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// Full description of each question for showing the form (fills in type/options for core ones).
export function describe(fields) {
  return fields.map((f) => {
    const core = CORE[f.id];
    if (core) {
      return {
        ...f, core: true, essential: Boolean(core.essential), type: core.type,
        options: core.options ? core.options.map(([value, label]) => ({ value, label })) : undefined,
      };
    }
    return { ...f, core: false, options: f.options?.map((o) => ({ value: o, label: o })) };
  });
}

// Checks a form layout saved from Settings.
export function cleanFields(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('The form needs at least one question');
  if (list.length > 40) throw new Error('That\'s a lot of questions! Keep it to 40 or fewer');
  const seen = new Set();
  const out = list.map((f) => {
    const id = str(f?.id, 20);
    if (seen.has(id)) throw new Error('Two questions have the same ID');
    seen.add(id);
    const label = str(f.label, 200);
    if (!label) throw new Error('Every question needs some wording');
    const base = { id, label, hint: str(f.hint, 200), required: Boolean(f.required) };
    if (CORE[id]) return CORE[id].essential ? { ...base, required: true } : base;
    if (!/^q_[a-z0-9]{4,16}$/.test(id)) throw new Error('A question has an invalid ID');
    if (!TYPES[f.type]) throw new Error(`"${label}" needs a question type`);
    const q = { ...base, type: f.type };
    if (OPTION_TYPES.has(f.type)) {
      const options = [...new Set((Array.isArray(f.options) ? f.options : []).map((o) => str(o, 100)).filter(Boolean))].slice(0, 30);
      if (!options.length) throw new Error(`"${label}" needs at least one option`);
      q.options = options;
    }
    return q;
  });
  for (const [id, d] of Object.entries(CORE)) {
    if (d.essential && !seen.has(id)) throw new Error(`"${d.label}" can't be removed: quotes and invoices need it`);
  }
  return out;
}

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

// Checks one answer to one of your own questions.
function cleanAnswer(f, v) {
  const opts = (f.options || []).map((o) => (typeof o === 'string' ? o : o.value));
  switch (f.type) {
    case 'checkboxes': {
      const picked = (Array.isArray(v) ? v : [v]).map((x) => String(x));
      if (picked.some((x) => !opts.includes(x))) throw new Error(`Check your answer to "${f.label}"`);
      return picked;
    }
    case 'choice':
    case 'dropdown':
      if (!opts.includes(String(v))) throw new Error(`Check your answer to "${f.label}"`);
      return String(v);
    case 'number':
    case 'money': {
      const n = Number(String(v).replace(/[£,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) throw new Error(`"${f.label}" needs a number`);
      return f.type === 'money' ? `£${n.toFixed(2)}` : String(n);
    }
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Check the date for "${f.label}"`);
      return v;
    case 'time':
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error(`Check the time for "${f.label}"`);
      return v;
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) throw new Error(`Check the email for "${f.label}"`);
      return str(v, 200);
    default:
      return str(v, f.type === 'long' ? 4000 : 300);
  }
}

// Splits a submitted form into booking details + extra answers, checking required questions.
export function readSubmission(fields, input) {
  const booking = {};
  const answers = [];
  const asksContact = fields.some((x) => x.id === 'contact_method');
  const wantsInstagram = String(input.contact_method || '').toLowerCase() === 'instagram';
  for (const f of describe(fields)) {
    const v = input[f.id];
    // The Instagram question only appears (and is only needed) when they pick Instagram as their contact method.
    const required = f.id === 'instagram' && asksContact ? wantsInstagram : f.required;
    if (blank(v)) {
      if (required) throw new Error('Please answer all the required questions');
      continue;
    }
    if (f.core) {
      booking[f.id] = v; // checked properly by cleanBooking()
    } else {
      answers.push({ id: f.id, question: f.label, answer: cleanAnswer(f, v) });
    }
  }
  return { booking, answers };
}
