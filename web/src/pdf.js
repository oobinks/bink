// Branded PDF quotes, made on your phone/laptop (not the server) so it stays free.
const GOLD = [0.957, 0.761, 0.357];
const PINK = [1, 0.353, 0.647];
const INK = [0.07, 0.07, 0.09];
const MUTED = [0.42, 0.4, 0.47];

const gbp = (p) => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'TBC';

export async function quotePdf(q, link) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(`Quote ${q.quoteNumber} – ${q.business.djName}`);
  doc.setAuthor(q.business.djName);
  const page = doc.addPage([595.28, 841.89]); // A4
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c = (a) => rgb(...a);
  // The built-in PDF fonts can't draw emoji and some symbols, so leave those out.
  const safe = (font, s) => [...String(s ?? '')].filter((ch) => { try { font.encodeText(ch); return true; } catch { return false; } }).join('');
  const text = (s, x, y, { font = reg, size = 10, color = INK, align = 'left' } = {}) => {
    const t = safe(font, s);
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: align === 'right' ? x - w : x, y, size, font, color: c(color) });
  };
  const wrap = (s, font, size, width) => {
    const out = [];
    for (const para of safe(font, s).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > width && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  };
  const W = 595.28;
  const L = 48;
  const R = W - 48;

  // Header band
  page.drawRectangle({ x: 0, y: 742, width: W, height: 100, color: rgb(0.043, 0.039, 0.063) });
  page.drawRectangle({ x: 0, y: 738, width: W / 2, height: 4, color: c(GOLD) });
  page.drawRectangle({ x: W / 2, y: 738, width: W / 2, height: 4, color: c(PINK) });
  text(q.business.djName, L, 785, { font: bold, size: 30, color: GOLD });
  text('DJ', L, 765, { font: bold, size: 10, color: [0.6, 0.58, 0.67] });
  text('QUOTE', R, 790, { font: bold, size: 22, color: [0.96, 0.95, 0.91], align: 'right' });
  text(q.quoteNumber, R, 772, { size: 10, color: [0.6, 0.58, 0.67], align: 'right' });
  text(`Date: ${new Date(q.quotedOn + 'T12:00:00').toLocaleDateString('en-GB')}`, R, 758, { size: 10, color: [0.6, 0.58, 0.67], align: 'right' });

  // From / for
  let y = 705;
  text('FROM', L, y, { font: bold, size: 8, color: MUTED });
  text('PREPARED FOR', 320, y, { font: bold, size: 8, color: MUTED });
  y -= 15;
  [q.business.legalName, q.business.address, q.business.email, q.business.phone].filter(Boolean)
    .forEach((l, i) => text(l, L, y - i * 13, { font: i === 0 ? bold : reg, size: 10 }));
  text(q.client, 320, y, { font: bold, size: 10 });

  // Event box
  y = 620;
  page.drawRectangle({ x: L, y: y - 62, width: R - L, height: 74, color: rgb(0.965, 0.957, 0.94) });
  text('YOUR EVENT', L + 14, y - 4, { font: bold, size: 8, color: MUTED });
  text(q.eventType || 'Event', L + 14, y - 22, { font: bold, size: 13 });
  text(`${longDate(q.eventDate)}${q.startTime ? `  ·  ${q.startTime}–${q.endTime || ''}` : ''}`, L + 14, y - 38, { size: 10 });
  text([q.venue, q.venueAddress].filter(Boolean).join(', ').replace(/\n/g, ', ').slice(0, 95), L + 14, y - 52, { size: 10, color: MUTED });

  // Items
  y = 520;
  text('DESCRIPTION', L, y, { font: bold, size: 8, color: MUTED });
  text('AMOUNT', R, y, { font: bold, size: 8, color: MUTED, align: 'right' });
  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.7, color: rgb(0.85, 0.84, 0.82) });
  for (const item of q.items) {
    y -= 20;
    text(item.label, L, y, { size: 11 });
    text(gbp(item.pence), R, y, { size: 11, align: 'right' });
    y -= 8;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: rgb(0.9, 0.89, 0.87) });
  }
  y -= 26;
  text('TOTAL', 360, y, { font: bold, size: 11, color: MUTED });
  text(gbp(q.totalPence), R, y, { font: bold, size: 18, align: 'right' });
  y -= 18;
  if (q.vatNote) text(q.vatNote, R, y, { size: 8.5, color: MUTED, align: 'right' });

  // Personal message
  if (q.message) {
    y -= 34;
    for (const line of wrap(q.message, reg, 10.5, R - L).slice(0, 12)) { text(line, L, y, { size: 10.5 }); y -= 15; }
  }

  // Footer: how to accept
  page.drawRectangle({ x: 0, y: 0, width: W, height: 92, color: rgb(0.043, 0.039, 0.063) });
  text('Happy to go ahead?', L, 60, { font: bold, size: 12, color: GOLD });
  text(link ? 'Accept online in one tap:' : `Just reply to ${q.business.email} to confirm your date.`, L, 44, { size: 9.5, color: [0.85, 0.83, 0.8] });
  if (link) {
    text(link, L, 30, { size: 9.5, color: PINK });
  }
  text(`Your date is secured once confirmed. Questions? ${q.business.email}`, L, 14, { size: 8, color: [0.6, 0.58, 0.67] });

  return new Blob([await doc.save()], { type: 'application/pdf' });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
