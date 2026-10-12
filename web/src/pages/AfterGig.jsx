// The morning after a gig: get paid, clips, notes, done. (/after/:id)
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Receipt, Clapperboard, NotebookPen, PartyPopper } from 'lucide-react';
import { api } from '../api.js';
import { money, longDate } from '../format.js';

export default function AfterGig() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [b, setB] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = () => api(`/bookings/${id}`).then((x) => { setB(x); setNotes((n) => n || x.gig_notes || ''); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const run = (label, fn) => async () => {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  };

  if (!b) return error ? <div className="msg err">{error}</div> : null;
  const deposit = b.deposit_paid_at ? b.deposit_pence || 0 : 0;
  const balance = Math.max(0, b.total_pence - deposit);
  const inv = b.invoice;
  const paid = inv?.status === 'paid';

  const paidOnNight = run('night', async () => {
    await api(`/after-gig/${b.id}/paid-on-night`, { method: 'POST' });
    await load();
  });
  const sendInvoice = run('invoice', async () => {
    const r = await api(`/invoices/from-booking/${b.id}`, { method: 'POST' });
    navigate(`/invoices/${r.id}`);
  });
  const saveNotes = () => api(`/after-gig/${b.id}/notes`, { method: 'POST', body: { notes } }).catch(() => {});
  const done = run('done', async () => {
    await api(`/after-gig/${b.id}/wrap`, { method: 'POST', body: { notes } });
    navigate('/', { replace: true });
  });

  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to="/" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
        <div className="row-main">
          <div className="eyebrow">After the gig</div>
          <div className="row-title" style={{ fontSize: 22, whiteSpace: 'normal' }}>How was {b.venue_name || b.client_name}?</div>
          <div className="row-sub">{longDate(b.event_date)} · {b.event_type || 'Gig'} · {b.client_name}</div>
        </div>
      </div>

      <div className="card step-card">
        <div className="step-head"><span className={`step-num${paid ? ' done' : ''}`}>{paid ? <Check size={16} /> : 1}</span><h3>Get paid</h3></div>
        {paid ? (
          <p className="lead" style={{ margin: 0 }}>All paid. <Link to={`/invoices/${inv.id}`} style={{ color: 'var(--gold)' }}>{inv.number}</Link></p>
        ) : (
          <>
            <p className="lead">
              {b.total_pence ? <>Balance due: <b style={{ color: 'var(--text)' }}>{money(balance)}</b>{deposit ? ` (after the ${money(deposit)} deposit)` : ''}.</> : 'No price on this booking yet.'}
              {inv && ` Invoice ${inv.number} is ${inv.status === 'draft' ? 'a draft' : 'sent'}.`}
            </p>
            <button className="btn primary block" disabled={!!busy} onClick={paidOnNight}>
              <Check size={18} /> {busy === 'night' ? 'Saving…' : 'Balance paid on the night'}
            </button>
            {inv
              ? <Link className="btn block" style={{ marginTop: 8 }} to={`/invoices/${inv.id}`}><Receipt size={18} /> Open invoice {inv.number}</Link>
              : <button className="btn block" style={{ marginTop: 8 }} disabled={!!busy} onClick={sendInvoice}><Receipt size={18} /> They still owe me: send invoice</button>}
          </>
        )}
      </div>

      <div className="card step-card">
        <div className="step-head"><span className="step-num">2</span><h3>Clips</h3></div>
        <p className="lead">Upload last night's videos and photos, star the best, and get reminded to post them.</p>
        <Link className="btn block" to={`/content/upload?gig=${b.id}`}><Clapperboard size={18} /> Upload clips</Link>
      </div>

      <div className="card step-card">
        <div className="step-head"><span className="step-num">3</span><h3>Notes for next time</h3></div>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
          placeholder="e.g. Great crowd, loved the disco edits. Ask about NYE. Load-in round the back." aria-label="Notes for next time" />
        <p className="hint" style={{ margin: '6px 0 0' }}><NotebookPen size={12} /> Only you see these. They're kept on the booking and the client's profile.</p>
      </div>

      <button className="btn primary block" style={{ marginTop: 18 }} disabled={!!busy} onClick={done}>
        <PartyPopper size={18} /> {busy === 'done' ? 'Wrapping up…' : 'Done'}
      </button>
      {error && <div className="msg err">{error}</div>}
    </>
  );
}
