// What a client sees when you send them a quote link (/q/<secret>).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download } from 'lucide-react';
import { api } from '../api.js';
import { money } from '../format.js';
import { quotePdf, downloadBlob } from '../pdf.js';

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
    if (!confirm(`Accept this quote for ${money(q.totalPence)}?`)) return;
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
        {q.message && <p style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>{q.message}</p>}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        {q.accepted ? (
          <div className="card done-card">
            <CheckCircle2 size={40} color="var(--green)" />
            <h3 style={{ marginTop: 8 }}>Accepted. Your date is booked!</h3>
            <p className="lead">Thank you. {q.business.djName} will be in touch with the next steps.</p>
          </div>
        ) : q.expired ? (
          <div className="card"><p className="lead" style={{ margin: 0 }}>This quote has expired. Please get in touch: {q.business.email}</p></div>
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
