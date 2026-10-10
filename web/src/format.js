const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export const money = (pence) => (pence == null ? '—' : gbp.format(pence / 100));
export const moneyShort = (pence) => (pence == null ? '—' : (pence % 100 ? gbp : gbp0).format(pence / 100));

const parse = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);

export function shortDate(iso) {
  if (!iso) return 'Date TBC';
  return parse(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function relativeDay(iso, today) {
  if (!iso) return '';
  const diff = Math.round((parse(iso.slice(0, 10)) - parse(today)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < 0) return `${-diff} days ago`;
  return shortDate(iso);
}

export function dateParts(iso) {
  if (!iso) return { day: '?', month: 'TBC' };
  const d = parse(iso);
  return { day: d.getDate(), month: d.toLocaleDateString('en-GB', { month: 'short' }) };
}

export function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// "£350" / "350.50" typed in a box -> pence (or null if empty/invalid).
export function toPence(input) {
  const n = parseFloat(String(input ?? '').replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
// pence -> what goes in an input box ("350" or "350.50").
export const fromPence = (p) => (p == null ? '' : (p % 100 ? (p / 100).toFixed(2) : String(p / 100)));

export function longDate(iso) {
  if (!iso) return 'Date TBC';
  return parse(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
