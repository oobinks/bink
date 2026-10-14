// Ask: answer questions about the business in plain English, using Cloudflare's free AI.
// The AI only ever *suggests* changes. Each suggestion is checked here against the real data and turned into a
// button; nothing changes until ctrinn taps it (and the tap goes through the normal app routes, which log it).
import { todayUK } from './db.js';
import { quoteTotal } from './booking-fields.js';
import { invoiceState } from './invoice-logic.js';

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const STATUSES = ['new', 'quoted', 'confirmed', 'completed', 'declined'];
const STATUS_WORD = { new: 'New', quoted: 'Quoted', confirmed: 'Confirmed', completed: 'Completed', declined: 'Declined' };
const pounds = (p) => `£${((p || 0) / 100).toFixed(2).replace(/\.00$/, '')}`;
const short = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const clean = (s) => String(s ?? '').replace(/[|\n\r]+/g, ' ').trim();

// Everything the AI may look at, as compact lines (keeps it fast and within the free daily allowance).
export async function buildContext(db) {
  const today = todayUK();
  const [bookings, invoices, activity] = await db.batch([
    db.prepare(`SELECT id, status, kind, client_name, client_email, event_type, event_date, venue_name, price_pence, extras,
        quote_sent_at, quote_accepted_at, deposit_pence, deposit_paid_at, created_at, updated_at
      FROM bookings ORDER BY updated_at DESC LIMIT 120`),
    db.prepare(`SELECT id, number, client_name, total_pence, status, sent_at, due_date, paid_at, viewed_at, chasing_paused
      FROM invoices ORDER BY updated_at DESC LIMIT 100`),
    db.prepare('SELECT at, action, detail FROM activity ORDER BY id DESC LIMIT 80'),
  ]).then((r) => r.map((x) => x.results));

  const b = bookings.map((x) => [
    `B${x.id}`, x.status, x.kind === 'club' ? 'club set' : 'party', clean(x.client_name), clean(x.event_type), x.event_date || 'no date',
    clean(x.venue_name), quoteTotal(x) ? pounds(quoteTotal(x)) : 'no price', x.client_email || '',
    x.quote_sent_at ? `quote sent ${x.quote_sent_at.slice(0, 10)}` : '', x.quote_accepted_at ? `accepted ${x.quote_accepted_at.slice(0, 10)}` : '',
    x.deposit_pence ? `deposit ${pounds(x.deposit_pence)} ${x.deposit_paid_at ? `paid ${x.deposit_paid_at.slice(0, 10)}` : 'not paid'}` : '',
    `added ${x.created_at.slice(0, 10)}`,
  ].filter(Boolean).join(' | '));
  const i = invoices.map((x) => [
    `I${x.id}`, x.number, clean(x.client_name), pounds(x.total_pence), invoiceState(x, today), `due ${x.due_date}`,
    x.paid_at ? `paid ${x.paid_at.slice(0, 10)}` : '', x.viewed_at ? 'viewed by client' : '', x.chasing_paused ? 'reminders paused' : '',
  ].filter(Boolean).join(' | '));
  const a = activity.map((x) => `${x.at.slice(0, 16).replace('T', ' ')} ${clean(x.action)}${x.detail ? `: ${clean(x.detail)}` : ''}`);

  return `Today is ${today} (UK).
Booking statuses: new = enquiry not replied to; quoted = quote sent; confirmed = booked (party: after the deposit);
completed = gig done; declined = closed/turned down (this is what "closed" usually means). Club sets are added by hand
as confirmed, with no quote or deposit. Re-opening a declined booking puts it back to quoted (if a quote was sent) or new.

BOOKINGS (id | status | type | client | occasion | date | venue | total | email | quote | deposit | added):
${b.join('\n') || 'none'}

INVOICES (id | number | client | total | state | due | paid | notes):
${i.join('\n') || 'none'}

CHANGE HISTORY (newest first; explains when and why things changed):
${a.join('\n') || 'none'}`;
}

export const SYSTEM = `You are the helper inside ctrinn's DJ admin app. ctrinn is a DJ, not a developer.
Answer using ONLY the data below. Be short, friendly and plain English (UK). Mention names and dates so it's clear what you mean.
If the data doesn't say, say you can't tell. Never make up bookings, invoices or amounts.
If ctrinn asks you to change something, you can't do it yourself: suggest it as an action and say "Tap the button to confirm."
If it's unclear which booking or invoice they mean, ask which one instead of suggesting an action.
Actions you can suggest (use ids from the data, numbers only):
- {"type":"booking_status","booking":12,"status":"quoted"}   (status: new, quoted, confirmed, completed or declined)
- {"type":"invoice_paid","invoice":5,"paid":true}            (paid: true or false)
- {"type":"invoice_reminders","invoice":5,"paused":false}    (paused: true or false)
- {"type":"open_booking","booking":12} or {"type":"open_invoice","invoice":5}   (a link to look at it)
Reply with JSON only, exactly like: {"answer":"...","actions":[]}`;

// Pull the JSON out of the AI's reply (it sometimes wraps it in text or code fences).
export function parseReply(raw) {
  if (raw && typeof raw === 'object') return { answer: String(raw.answer || ''), actions: Array.isArray(raw.actions) ? raw.actions : [] };
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const j = JSON.parse(text.slice(start, end + 1));
      if (typeof j.answer === 'string') return { answer: j.answer, actions: Array.isArray(j.actions) ? j.actions : [] };
    } catch { /* fall through */ }
  }
  return { answer: text || "Sorry, I didn't catch that. Could you ask another way?", actions: [] };
}

// Turn suggestions into safe buttons. Anything that doesn't match real data is dropped.
export async function checkActions(db, suggested) {
  const out = [];
  const seen = new Set();
  for (const s of suggested.slice(0, 8)) {
    if (out.length >= 3) break; // at most 3 buttons
    if (!s || typeof s !== 'object') continue;
    const bookingId = Number(s.booking);
    const invoiceId = Number(s.invoice);
    let action = null;
    if (['booking_status', 'open_booking'].includes(s.type) && Number.isInteger(bookingId)) {
      const b = await db.prepare('SELECT id, status, client_name, event_type, event_date, quote_sent_at FROM bookings WHERE id = ?').bind(bookingId).first();
      if (!b) continue;
      const what = `${b.client_name}${b.event_type || b.event_date ? ` (${[b.event_type, short(b.event_date)].filter(Boolean).join(', ')})` : ''}`;
      if (s.type === 'open_booking') {
        action = { kind: 'open', label: `Open ${what}`, link: `/bookings/${b.id}` };
      } else if (STATUSES.includes(s.status) && s.status !== b.status) {
        const verb = s.status === 'declined' ? 'Decline' : s.status === 'confirmed' ? 'Confirm'
          : s.status === 'completed' ? 'Mark completed:' : b.status === 'declined' || b.status === 'completed' ? 'Re-open' : 'Move to';
        const label = verb === 'Re-open' || verb === 'Move to'
          ? `${verb} ${what} as ${STATUS_WORD[s.status]}` : `${verb} ${what}`;
        action = { kind: 'do', label, method: 'POST', path: `/bookings/${b.id}/status`, body: { status: s.status }, link: `/bookings/${b.id}` };
      }
    } else if (['invoice_paid', 'invoice_reminders', 'open_invoice'].includes(s.type) && Number.isInteger(invoiceId)) {
      const inv = await db.prepare('SELECT id, number, client_name, total_pence, status, chasing_paused FROM invoices WHERE id = ?').bind(invoiceId).first();
      if (!inv) continue;
      const what = `${inv.number} (${inv.client_name}, ${pounds(inv.total_pence)})`;
      if (s.type === 'open_invoice') {
        action = { kind: 'open', label: `Open ${what}`, link: `/invoices/${inv.id}` };
      } else if (s.type === 'invoice_paid' && typeof s.paid === 'boolean' && s.paid !== (inv.status === 'paid')) {
        action = { kind: 'do', label: s.paid ? `Mark ${what} as paid` : `Mark ${what} as not paid`, method: 'POST',
          path: `/invoices/${inv.id}/paid`, body: { paid: s.paid }, link: `/invoices/${inv.id}` };
      } else if (s.type === 'invoice_reminders' && typeof s.paused === 'boolean' && s.paused !== Boolean(inv.chasing_paused)) {
        action = { kind: 'do', label: `${s.paused ? 'Pause' : 'Restart'} payment reminders for ${what}`, method: 'POST',
          path: `/invoices/${inv.id}/chasing`, body: { paused: s.paused }, link: `/invoices/${inv.id}` };
      }
    }
    if (action && !seen.has(action.label)) {
      seen.add(action.label);
      out.push(action);
    }
  }
  return out;
}

// Ask the AI. In the offline test setup (ASK_FAKE) a stand-in replies with whatever JSON the question contains.
export async function runModel(env, messages) {
  if (env.ASK_FAKE) {
    const q = messages.at(-1).content;
    return q.trim().startsWith('{') ? q : JSON.stringify({ answer: `You asked: ${q}`, actions: [] });
  }
  const result = await env.AI.run(MODEL, { messages, max_tokens: 700, temperature: 0.2 });
  return result?.response ?? '';
}
