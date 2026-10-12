// Branded PDF quotes, made on your phone/laptop (not the server) so it stays free.
const GOLD = [0.957, 0.761, 0.357];
const PINK = [1, 0.353, 0.647];
const INK = [0.07, 0.07, 0.09];
const MUTED = [0.42, 0.4, 0.47];
const GREEN = [0.16, 0.7, 0.45];

const gbp = (p) => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'TBC';

// One branded layout for quotes and invoices.
async function brandedPdf(d) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.kind === 'QUOTE' ? 'Quote' : 'Invoice'} ${d.number} – ${d.business.djName}`);
  doc.setAuthor(d.business.djName);
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
  const soft = [0.6, 0.58, 0.67];

  // Header band
  page.drawRectangle({ x: 0, y: 742, width: W, height: 100, color: rgb(0.043, 0.039, 0.063) });
  page.drawRectangle({ x: 0, y: 738, width: W / 2, height: 4, color: c(GOLD) });
  page.drawRectangle({ x: W / 2, y: 738, width: W / 2, height: 4, color: c(PINK) });
  text(d.business.djName, L, 785, { font: bold, size: 30, color: GOLD });
  text('DJ', L, 765, { font: bold, size: 10, color: soft });
  text(d.kind, R, 790, { font: bold, size: 22, color: [0.96, 0.95, 0.91], align: 'right' });
  text(d.number, R, 772, { size: 10, color: soft, align: 'right' });
  d.dateLines.forEach((l, i) => text(l, R, 758 - i * 13, { size: 10, color: soft, align: 'right' }));

  // From / for
  let y = 705;
  text('FROM', L, y, { font: bold, size: 8, color: MUTED });
  text(d.kind === 'QUOTE' ? 'PREPARED FOR' : 'BILL TO', 320, y, { font: bold, size: 8, color: MUTED });
  y -= 15;
  [d.business.legalName, d.business.address, d.business.email, d.business.phone].filter(Boolean)
    .forEach((l, i) => text(l, L, y - i * 13, { font: i === 0 ? bold : reg, size: 10 }));
  [d.to.name, ...(d.to.address ? d.to.address.split('\n') : []), d.to.email].filter(Boolean).slice(0, 5)
    .forEach((l, i) => text(l, 320, y - i * 13, { font: i === 0 ? bold : reg, size: 10 }));

  // Event box (quotes)
  y = 620;
  if (d.event) {
    page.drawRectangle({ x: L, y: y - 62, width: R - L, height: 74, color: rgb(0.965, 0.957, 0.94) });
    text('YOUR EVENT', L + 14, y - 4, { font: bold, size: 8, color: MUTED });
    text(d.event.title, L + 14, y - 22, { font: bold, size: 13 });
    text(d.event.when, L + 14, y - 38, { size: 10 });
    text(d.event.where.slice(0, 95), L + 14, y - 52, { size: 10, color: MUTED });
    y = 520;
  } else {
    y = 600;
  }

  // Items
  text('DESCRIPTION', L, y, { font: bold, size: 8, color: MUTED });
  text('AMOUNT', R, y, { font: bold, size: 8, color: MUTED, align: 'right' });
  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.7, color: rgb(0.85, 0.84, 0.82) });
  for (const item of d.items) {
    const lines = wrap(item.label, reg, 11, R - L - 110);
    y -= 20;
    lines.forEach((l, i) => text(l, L, y - i * 14, { size: 11 }));
    text(gbp(item.pence), R, y, { size: 11, align: 'right' });
    y -= 8 + (lines.length - 1) * 14;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: rgb(0.9, 0.89, 0.87) });
  }
  y -= 26;
  text(d.kind === 'QUOTE' ? 'TOTAL' : 'AMOUNT DUE', 330, y, { font: bold, size: 11, color: MUTED });
  text(gbp(d.totalPence), R, y, { font: bold, size: 18, align: 'right' });
  y -= 18;
  if (d.vatNote) text(d.vatNote, R, y, { size: 8.5, color: MUTED, align: 'right' });

  // How to pay (invoices)
  if (d.pay) {
    y -= 30;
    const rows = [['Account name', d.pay.accountName], ['Bank', d.pay.bankName], ['Sort code', d.pay.sortCode],
      ['Account number', d.pay.accountNumber], ['Reference', d.pay.reference]].filter(([, v]) => v);
    const h = 30 + rows.length * 15;
    page.drawRectangle({ x: L, y: y - h + 12, width: R - L, height: h, color: rgb(0.965, 0.957, 0.94) });
    text('HOW TO PAY', L + 14, y - 4, { font: bold, size: 8, color: MUTED });
    text(d.pay.terms, R - 14, y - 4, { font: bold, size: 8.5, color: [0.75, 0.2, 0.45], align: 'right' });
    rows.forEach(([k, v], i) => {
      text(k, L + 14, y - 22 - i * 15, { size: 10, color: MUTED });
      text(v, L + 130, y - 22 - i * 15, { font: bold, size: 10 });
    });
    y -= h;
  }

  // Message / notes
  if (d.message) {
    y -= 24;
    for (const line of wrap(d.message, reg, 10.5, R - L).slice(0, 10)) { text(line, L, y, { size: 10.5 }); y -= 15; }
  }

  // PAID stamp
  if (d.paidOn) {
    page.drawText('PAID', { x: 330, y: 560, size: 70, font: bold, color: c(GREEN), opacity: 0.25, rotate: degrees(18) });
    text(`Paid ${new Date(d.paidOn + 'T12:00:00').toLocaleDateString('en-GB')}. Thank you!`, R, 205, { font: bold, size: 10, color: [0.15, 0.6, 0.4], align: 'right' });
  }

  // Footer
  page.drawRectangle({ x: 0, y: 0, width: W, height: 92, color: rgb(0.043, 0.039, 0.063) });
  text(d.footer.heading, L, 60, { font: bold, size: 12, color: GOLD });
  text(d.footer.line, L, 44, { size: 9.5, color: [0.85, 0.83, 0.8] });
  if (d.footer.link) text(d.footer.link, L, 30, { size: 9.5, color: PINK });
  text(d.footer.small, L, 14, { size: 8, color: soft });

  return new Blob([await doc.save()], { type: 'application/pdf' });
}

const ukDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB');

export function quotePdf(q, link) {
  return brandedPdf({
    kind: 'QUOTE', number: q.quoteNumber, business: q.business, dateLines: [`Date: ${ukDate(q.quotedOn)}`],
    to: { name: q.client },
    event: {
      title: q.eventType || 'Event',
      when: `${longDate(q.eventDate)}${q.startTime ? `  ·  ${q.startTime}–${q.endTime || ''}` : ''}`,
      where: [q.venue, q.venueAddress].filter(Boolean).join(', ').replace(/\n/g, ', '),
    },
    items: q.items, totalPence: q.totalPence, vatNote: q.vatNote, message: q.message,
    footer: {
      heading: 'Happy to go ahead?',
      line: link ? 'Accept online in one tap:' : `Just reply to ${q.business.email} to confirm your date.`,
      link, small: `Your date is secured once confirmed. Questions? ${q.business.email}`,
    },
  });
}

// inv: the shape returned for a public invoice link.
export function invoicePdf(inv, link) {
  return brandedPdf({
    kind: 'INVOICE', number: inv.number, business: inv.business,
    dateLines: [`Issued: ${ukDate(inv.issueDate)}`, `Due: ${ukDate(inv.dueDate)}`],
    to: { name: inv.client, email: inv.clientEmail, address: inv.clientAddress },
    items: inv.items.map((i) => ({ label: i.description, pence: i.pence })), totalPence: inv.totalPence,
    vatNote: inv.vatNote, message: inv.notes, paidOn: inv.paidOn,
    pay: inv.paidOn ? null : { ...inv.bank, reference: inv.reference, terms: `PLEASE PAY BY ${longDate(inv.dueDate).toUpperCase()}` },
    footer: {
      heading: 'Thank you for booking ctrinn!'.replace('ctrinn', inv.business.djName),
      line: link ? 'View this invoice online:' : `Questions? ${inv.business.email}`,
      link, small: `Payment due within ${inv.paymentTermsDays} days of the invoice date. Questions? ${inv.business.email} · ${inv.business.phone}`,
    },
  });
}

// Base64 of a PDF, for attaching to an email.
export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
