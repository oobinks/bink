// TimeTree can't be added to by other apps, so we copy the gig details for you to paste.
import { longDate, money } from './format.js';

export function gigText(b) {
  const time = b.start_time ? `${b.start_time}–${b.end_time || '?'}` : '';
  return [
    `🎧 ${b.venue_name || b.client_name}${b.event_type ? ` · ${b.event_type}` : ''}`,
    [longDate(b.event_date), time].filter(Boolean).join(', '),
    [b.venue_name, b.venue_address].filter(Boolean).join(', ').replace(/\n/g, ', '),
    `Client: ${b.client_name}${b.client_phone ? ` · ${b.client_phone}` : ''}`,
    b.total_pence ? `Fee: ${money(b.total_pence)}` : '',
  ].filter(Boolean).join('\n');
}

export async function copyForTimeTree(b) {
  await navigator.clipboard.writeText(gigText(b));
}
