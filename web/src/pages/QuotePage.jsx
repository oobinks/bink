// What a client sees when you send them a quote link (/q/<secret>).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download } from 'lucide-react';
import { api } from '../api.js';
import { money } from '../format.js';
import { quotePdf, downloadBlob } from '../pdf.js';
import { CopyRow } from './InvoicePage.jsx';

const dueDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const longDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date TBC';

export default function QuotePage() {
  const { token } = useParams();
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api(`/public/quote/${token}`).then(setQ).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  useEffect(() => { if (q) document.title = `Quote from ${q.business.djName}`; }, [q]);

  const accept = async () => {
    const terms = q.depositPence > 0 ? `\n\nYour booking is confirmed once the ${money(q.depositPence)} deposit is paid (by ${dueDate(q.depositDueBy)}).` : '';
    if (!confirm(`Accept this quote for ${money(q.totalPence)}?${terms}`)) return;
    setBusy(true);
    try {
      await api(`/public/quote/${token}/accept`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const pdf = async () => downloadBlob(await quotePdf(q, window.location.href), `${q.business.djName}-quote-${q.quoteNumber}.pdf`);

  if (error && !q) return <div className="public"><div className="card"><h3>Sorry</h3><p className="lead">{error}</p></div></div>;
  if (!q) return null;
  return (
    <div className="public">
      <header className="public-head">
        <div className="wordmark"><span>{q.business.djName}</span></div>
        <h1>Your quote</h1>
        <p className="intro">For {q.client} · {q.quoteNumber}</p>
      </header>

      <div className="card">
        <div className="eyebrow">Your event</div>
        <h3 style={{ marginTop: 4 }}>{q.eventType}</h3>
        <div className="kv"><span>Date</span><span>{longDate(q.eventDate)}</span></div>
        {q.startTime && <div className="kv"><span>Time</span><span>{q.startTime}–{q.endTime}</span></div>}
        <div className="kv"><span>Venue</span><span>{[q.venue, q.venueAddress].filter(Boolean).join(', ')}</span></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {q.items.map((i, n) => (
          <div className="kv" key={n}><span>{i.label}</span><span className="row-amount">{money(i.pence)}</span></div>
        ))}
        <div className="quote-total"><span>Total</span><b>{money(q.totalPence)}</b></div>
        {q.vatNote && <p className="hint" style={{ textAlign: 'right', margin: 0 }}>{q.vatNote}</p>}
        {q.depositPence > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="kv"><span><b style={{ color: 'var(--pink)' }}>Deposit to confirm your booking</b></span><span className="row-amount">{money(q.depositPence)}</span></div>
            <div className="kv"><span>Balance payable on the night</span><span className="row-amount">{money(q.balancePence)}</span></div>
          </div>
        )}
        {q.message && <p style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>{q.message}</p>}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        {q.confirmed ? (
          <div className="card done-card">
            <CheckCircle2 size={40} color="var(--green)" />
            <h3 style={{ marginTop: 8 }}>Your date is booked!</h3>
            <p className="lead">{q.depositPaid ? `Deposit received, thank you. The balance of ${money(q.balancePence)} is paid on the night.` : `Thank you. ${q.business.djName} will be in touch with the next steps.`}</p>
          </div>
        ) : q.expired ? (
          <div className="card"><p className="lead" style={{ margin: 0 }}>This quote has expired. Please get in touch: {q.business.email}</p></div>
        ) : q.depositPence > 0 && !q.depositPaid ? (
          <>
            <div className="card deposit-card">
              <h3>{q.accepted ? 'Thank you! Now pay the deposit' : 'How to confirm your booking'}</h3>
              <p className="lead">
                Your booking is <b>only confirmed once the {money(q.depositPence)} deposit is paid</b>. Please pay it by bank transfer
                within {q.depositDays} days of receiving this quote, by <b>{dueDate(q.depositDueBy)}</b>. Tap any detail to copy it.
              </p>
              {q.bank?.sortCode ? <>
                <CopyRow label="Amount" value={money(q.depositPence)} />
                <CopyRow label="Account name" value={q.bank.accountName} />
                {q.bank.bankName && <CopyRow label="Bank" value={q.bank.bankName} />}
                <CopyRow label="Sort code" value={q.bank.sortCode} />
                <CopyRow label="Account number" value={q.bank.accountNumber} />
                <CopyRow label="Reference" value={q.quoteNumber} />
              </> : <p className="lead">{q.business.djName} will send you the payment details.</p>}
              <p className="hint" style={{ marginBottom: 0 }}>The balance of {money(q.balancePence)} is paid on the night.</p>
            </div>
            {!q.accepted && (
              <button className="btn primary block" onClick={accept} disabled={busy}>{busy ? 'Accepting…' : `Accept quote · ${money(q.totalPence)}`}</button>
            )}
          </>
        ) : (
          <button className="btn primary block" onClick={accept} disabled={busy}>{busy ? 'Accepting…' : `Accept quote · ${money(q.totalPence)}`}</button>
        )}
        <button className="btn block" onClick={pdf}><Download size={18} /> Download PDF</button>
        {error && <div className="msg err">{error}</div>}
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: 24 }}>
        Questions? <a style={{ color: 'var(--gold)' }} href={`mailto:${q.business.email}`}>{q.business.email}</a> · {q.business.phone}
      </p>
    </div>
  );
}
