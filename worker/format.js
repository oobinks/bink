// Small text helpers for messages the server writes (e.g. notifications).
export function shortDate(iso) {
  if (!iso) return 'date TBC';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const pounds = (pence) => `£${((pence || 0) / 100).toFixed(2).replace(/\.00$/, '')}`;
