import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, MessageSquare, Mail, Camera, MapPin, AlertTriangle, Pencil, Send, Link2, FileDown,
  Check, X, Plus, Star, CalendarCheck, ExternalLink, Receipt,
} from 'lucide-react';
import { api } from '../api.js';
import { money, fromPence, toPence, longDate, timeAgo } from '../format.js';
import { quotePdf, downloadBlob } from '../pdf.js';
import { shareOrCopy, shareFile } from '../share.js';
import { STATUS_INFO } from './Bookings.jsx';

const EQUIPMENT_LABEL = 'Speakers, lights & DJ booth';

function Fact({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return <div className="kv"><span>{label}</span><span>{children}</span></div>;
}

export function ContactButtons({ b }) {
  const pref = b.contact_method;
  const digits = (b.client_phone || '').replace(/[^\d+]/g, '');
  const ig = b.instagram?.replace(/^@/, '');
  const items = [
    digits && { key: 'phone', href: `tel:${digits}`, icon: Phone, label: 'Call' },
    digits && { key: 'phone', href: `sms:${digits}`, icon: MessageSquare, label: 'Text' },
    b.client_email && { key: 'email', href: `mailto:${b.client_email}`, icon: Mail, label: 'Email' },
    ig && { key: 'instagram', href: `https://instagram.com/${ig}`, icon: Camera, label: 'Instagram' },
  ].filter(Boolean);
  return (
    <div className="contact-row">
      {items.map((i) => (
        <a key={i.label} href={i.href} className={`contact-btn${i.key === pref ? ' pref' : ''}`} target={i.key === 'instagram' ? '_blank' : undefined} rel="noreferrer">
          <i.icon size={20} />
          <span>{i.label}</span>
          {i.key === pref && <Star size={10} className="pref-star" fill="currentColor" />}
        </a>
      ))}
    </div>
  );
}

function QuoteBuilder({ b, pricing, onSaved }) {
  const [price, setPrice] = useState(fromPence(b.price_pence));
  const [extras, setExtras] = useState(() => {
    if (b.extras.length || b.price_pence != null) return b.extras.map((e) => ({ label: e.label, amount: fromPence(e.pence) }));
    // First time: if they asked for equipment, add it for you.
    return b.equipment === 'yes' ? [{ label: EQUIPMENT_LABEL, amount: fromPence(pricing.equipmentPence) }] : [];
  });
  const [miles, setMiles] = useState(b.travel_miles ?? '');
  const [message, setMessage] = useState(b.quote_message || '');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [sent, setSent] = useState(b.quote_token ? `${window.location.origin}/q/${b.quote_token}` : null);

  const extrasPence = extras.map((e) => ({ label: e.label.trim(), pence: toPence(e.amount) ?? 0 }));
  const total = (toPence(price) || 0) + extrasPence.reduce((a, e) => a + e.pence, 0);

  const addExtra = (label, pence) => setExtras((list) => [...list, { label, amount: fromPence(pence) }]);
  const addHour = () => {
    const i = extras.findIndex((e) => e.label.startsWith('Extra hour'));
    if (i === -1) return addExtra('Extra hour', pricing.extraHourPence);
    const n = (parseInt(extras[i].label.match(/\d+/)?.[0] || '1', 10)) + 1;
    setExtras((list) => list.map((e, j) => j === i ? { label: `Extra hours (${n})`, amount: fromPence(n * pricing.extraHourPence) } : e));
  };
  const addTravel = () => {
    const m = Number(miles);
    if (!m) return setMsg({ ok: false, text: 'Type the miles first' });
    const charged = Math.max(0, m - pricing.freeMiles);
    const pence = Math.round(charged * pricing.travelPerMilePence);
    setExtras((list) => [...list.filter((e) => !e.label.startsWith('Travel')), { label: `Travel (${m} miles)`, amount: fromPence(pence) }]);
    if (!charged) setMsg({ ok: true, text: `Within your ${pricing.freeMiles} free miles` });
  };

  const save = async () => {
    if (toPence(price) == null) throw new Error('Set a price first');
    if (extrasPence.some((e) => !e.label)) throw new Error('Give each extra a name');
    await api(`/bookings/${b.id}/quote`, {
      method: 'PUT', body: { price_pence: toPence(price), extras: extrasPence, travel_miles: miles, quote_message: message },
    });
  };

  const run = (label, fn) => async () => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy('');
  };

  const send = async () => {
    await save();
    const { path } = await api(`/bookings/${b.id}/quote/send`, { method: 'POST' });
    const url = window.location.origin + path;
    setSent(url);
    onSaved();
    return url;
  };

  const shareLink = run('share', async () => {
    const url = await send();
    const r = await shareOrCopy({ title: 'Your quote', text: `Hi ${b.client_name.split(' ')[0]}, here's your quote for ${b.event_type || 'your event'}:`, url });
    if (r === 'copied') setMsg({ ok: true, text: 'Quote link copied. Paste it into a message.' });
  });
  const email = run('email', async () => {
    const url = await send();
    const first = b.client_name.split(' ')[0];
    const subject = `Your DJ quote: ${b.event_type || 'event'} on ${longDate(b.event_date)}`;
    const body = `Hi ${first},\n\nThanks for your enquiry! Here's your quote (${money(total)}):\n${url}\n\nYou can accept it online in one tap, and it's also downloadable as a PDF.\n\nAny questions, just reply to this email.\n\nThanks,\nctrinn`;
    window.location.href = `mailto:${b.client_email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
  const pdf = run('pdf', async () => {
    const url = await send();
    const q = await api(`/public/quote/${url.split('/q/')[1]}`);
    const blob = await quotePdf(q, url);
    const name = `ctrinn-quote-${q.quoteNumber}.pdf`;
    if (!(await shareFile(blob, name, 'Your quote'))) downloadBlob(blob, name);
  });

  return (
    <div className="card">
      <h3>Quote</h3>
      {pricing.presets.length > 0 && (
        <div className="choices" style={{ margin: '8px 0 14px' }}>
          {pricing.presets.map((p) => (
            <button type="button" key={p.name} className="chip" onClick={() => setPrice(fromPence(p.pence))}>
              {p.name} · {money(p.pence).replace('.00', '')}
            </button>
          ))}
        </div>
      )}
      <div className="field">
        <label htmlFor="price">Price for {b.event_type || 'the gig'}</label>
        <input id="price" className="input" inputMode="decimal" placeholder="£" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>

      {extras.map((e, i) => (
        <div className="extra-row" key={i}>
          <input className="input" value={e.label} aria-label="Extra" onChange={(ev) => setExtras((l) => l.map((x, j) => j === i ? { ...x, label: ev.target.value } : x))} />
          <input className="input amount" inputMode="decimal" value={e.amount} aria-label="Amount" onChange={(ev) => setExtras((l) => l.map((x, j) => j === i ? { ...x, amount: ev.target.value } : x))} />
          <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setExtras((l) => l.filter((_, j) => j !== i))}><X size={16} /></button>
        </div>
      ))}

      <div className="choices" style={{ margin: '4px 0 12px' }}>
        {!extras.some((e) => e.label === EQUIPMENT_LABEL) && (
          <button type="button" className="chip" onClick={() => addExtra(EQUIPMENT_LABEL, pricing.equipmentPence)}><Plus size={14} /> Equipment</button>
        )}
        <button type="button" className="chip" onClick={addHour}><Plus size={14} /> Extra hour</button>
        <button type="button" className="chip" onClick={() => addExtra('', 0)}><Plus size={14} /> Other</button>
      </div>
      <div className="extra-row">
        <input className="input" inputMode="numeric" placeholder="Travel miles (one way)" value={miles} onChange={(e) => setMiles(e.target.value)} />
        <button type="button" className="btn small" onClick={addTravel}>Add travel</button>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="qmsg">Message on the quote (optional)</label>
        <textarea id="qmsg" className="input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Includes a full sound check and your must-play list" />
      </div>

      <div className="quote-total"><span>Total</span><b>{money(total)}</b></div>

      <div className="send-grid">
        <button className="btn primary" disabled={!!busy} onClick={shareLink}><Send size={18} /> {busy === 'share' ? '…' : sent ? 'Share again' : 'Send quote'}</button>
        <button className="btn" disabled={!!busy} onClick={email}><Mail size={18} /> Email</button>
        <button className="btn" disabled={!!busy} onClick={pdf}><FileDown size={18} /> PDF</button>
        <button className="btn" disabled={!!busy} onClick={run('save', async () => { await save(); onSaved(); setMsg({ ok: true, text: 'Saved' }); })}>
          <Check size={18} /> Save
        </button>
      </div>
      {sent && <a className="hint view-link" href={sent} target="_blank" rel="noreferrer"><Link2 size={13} /> View what the client sees <ExternalLink size={12} /></a>}
      {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </div>
  );
}

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [b, setB] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [error, setError] = useState('');

  const load = () => api(`/bookings/${id}`).then(setB).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api('/settings').then((s) => setPricing(s.pricing)).catch(() => {});
  }, [id]);

  const setStatus = async (status) => {
    if (status === 'confirmed' && b.clashes.length) {
      const names = b.clashes.map((c) => c.client_name).join(', ');
      if (!confirm(`⚠️ You're already booked on this date (${names}). Confirm anyway?`)) return;
    }
    if (status === 'declined' && !confirm('Decline this enquiry?')) return;
    try {
      await api(`/bookings/${b.id}/status`, { method: 'POST', body: { status } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const createInvoice = async () => {
    try {
      const { id: invoiceId } = await api(`/invoices/from-booking/${b.id}`, { method: 'POST' });
      navigate(`/invoices/${invoiceId}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${b.client_name}'s booking for good? (Use Decline instead to keep a record.)`)) return;
    await api(`/bookings/${b.id}`, { method: 'DELETE' });
    navigate('/bookings', { replace: true });
  };

  if (error && !b) return <div className="msg err">{error}</div>;
  if (!b || !pricing) return null;
  const s = STATUS_INFO[b.status];
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.venue_name, b.venue_address].filter(Boolean).join(', '))}`;

  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to={`/bookings?tab=${b.status}`} className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
        <div className="row-main">
          <div className="row-title" style={{ fontSize: 20 }}>{b.client_name}</div>
          <span className={`pill ${s.tone}`}>{s.label}</span>
          {b.source === 'form' && <span className="row-sub" style={{ marginLeft: 8 }}>via booking form · {timeAgo(b.created_at)}</span>}
        </div>
        <Link to={`/bookings/${b.id}/edit`} className="icon-btn" aria-label="Edit"><Pencil size={18} /></Link>
      </div>

      {b.clashes.length > 0 && b.status !== 'declined' && (
        <div className="warn">
          <AlertTriangle size={18} />
          <span>Date clash: you're already booked on this day ({b.clashes.map((c) => `${c.client_name}${c.start_time ? ` ${c.start_time}` : ''}`).join(', ')}).</span>
        </div>
      )}

      <ContactButtons b={b} />
      {b.client_id && <Link to={`/clients/${b.client_id}`} className="client-link" style={{ marginTop: 10 }}>View client profile →</Link>}

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 8 }}>{b.event_type || 'Event'}</h3>
        <Fact label="Date">{longDate(b.event_date)}</Fact>
        <Fact label="Time">{b.start_time && `${b.start_time}–${b.end_time || '?'}`}</Fact>
        <Fact label="Venue">{b.venue_name}</Fact>
        <Fact label="Address">{b.venue_address && <a href={mapUrl} target="_blank" rel="noreferrer" className="map-link"><MapPin size={13} /> {b.venue_address}</a>}</Fact>
        <Fact label="Guests">{b.guests}</Fact>
        <Fact label="Needs equipment">{b.equipment && b.equipment[0].toUpperCase() + b.equipment.slice(1)}</Fact>
        <Fact label="Budget">{b.budget_pence != null && money(b.budget_pence)}</Fact>
        <Fact label="Prefers">{b.contact_method && { email: 'Email', phone: 'Phone / Text', instagram: 'Instagram' }[b.contact_method]}</Fact>
        <Fact label="Phone">{b.client_phone}</Fact>
        <Fact label="Email">{b.client_email}</Fact>
        <Fact label="Instagram">{b.instagram}</Fact>
        {b.notes && <p className="notes">{b.notes}</p>}
      </div>

      <div className="section">
        <QuoteBuilder b={b} pricing={pricing} onSaved={load} />
      </div>

      <div className="section btn-row">
        {['new', 'quoted'].includes(b.status) && (
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setStatus('confirmed')}><CalendarCheck size={18} /> Confirm booking</button>
        )}
        {b.status === 'confirmed' && <button className="btn" style={{ flex: 1 }} onClick={() => setStatus('completed')}><Check size={18} /> Mark completed</button>}
        {['new', 'quoted', 'confirmed'].includes(b.status) && <button className="btn" onClick={() => setStatus('declined')}>Decline</button>}
        {['declined', 'completed'].includes(b.status) && <button className="btn" onClick={() => setStatus(b.quote_sent_at ? 'quoted' : 'new')}>Reopen</button>}
      </div>
      {['confirmed', 'completed'].includes(b.status) && (
        b.invoice
          ? <Link className="btn block" style={{ marginTop: 10 }} to={`/invoices/${b.invoice.id}`}><Receipt size={18} /> View invoice {b.invoice.number}</Link>
          : <button className="btn primary block" style={{ marginTop: 10 }} onClick={createInvoice}><Receipt size={18} /> Create invoice</button>
      )}
      {b.quote_accepted_at && <p className="hint">Client accepted the quote online on {new Date(b.quote_accepted_at).toLocaleDateString('en-GB')}.</p>}
      {error && <div className="msg err">{error}</div>}

      <button className="btn danger block" style={{ marginTop: 28 }} onClick={remove}>Delete booking</button>
    </>
  );
}
