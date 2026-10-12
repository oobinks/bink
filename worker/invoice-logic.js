// Invoice rules that don't need the database: state, numbering, tax years,
// email wording and the reminder schedule. Kept separate so they're easy to test.
import { addDays } from './db.js';

// paid > overdue > viewed > sent > draft
export function invoiceState(inv, today) {
  if (inv.status === 'paid') return 'paid';
  if (inv.status === 'draft') return 'draft';
  if (inv.due_date < today) return 'overdue';
  return inv.viewed_at ? 'viewed' : 'sent';
}

export const formatNumber = (prefix, n) => `${prefix}${String(n).padStart(3, '0')}`;

// UK tax year runs 6 April to 5 April. "2026-27" for 2026-04-06 to 2027-04-05.
export function taxYear(isoDate) {
  const y = Number(isoDate.slice(0, 4));
  const start = isoDate.slice(5) >= '04-06' ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export const pounds = (pence) => '£' + ((pence || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const longDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function templateVars(inv, { djName, link, eventLabel }) {
  return {
    first_name: (inv.client_name || '').split(' ')[0] || 'there',
    client_name: inv.client_name || '',
    number: inv.number,
    amount: pounds(inv.total_pence),
    due_date: longDate(inv.due_date),
    issue_date: longDate(inv.issue_date),
    event: eventLabel || 'your event',
    link,
    dj_name: djName,
  };
}

export const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

// Which reminder (if any) should go out today for this invoice?
// steps: [{ days, on }] relative to the due date. sentSteps: step indexes already handled.
// Only the most recent due reminder is sent; older missed ones are skipped, so a client
// never gets a pile of reminders at once. Reminders dated before the invoice was sent are skipped too.
export function reminderDue(inv, steps, today, sentSteps) {
  if (inv.status !== 'sent' || inv.chasing_paused) return null;
  const sentDate = (inv.sent_at || inv.issue_date).slice(0, 10);
  const due = [];
  steps.forEach((st, i) => {
    if (!st.on || sentSteps.has(i)) return;
    const when = addDays(inv.due_date, st.days);
    if (when <= today) due.push({ i, when });
  });
  if (!due.length) return null;
  const latest = due[due.length - 1];
  const skip = due.slice(0, -1).map((d) => d.i);
  if (latest.when < sentDate) return { send: null, skip: [...skip, latest.i] };
  return { send: latest.i, skip };
}
