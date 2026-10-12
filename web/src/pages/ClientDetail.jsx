import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Receipt, CalendarPlus } from 'lucide-react';
import { api } from '../api.js';
import { money, moneyShort, shortDate } from '../format.js';
import { ContactButtons } from './BookingDetail.jsx';
import { STATUS_INFO } from './Bookings.jsx';
import { INVOICE_STATE } from './Invoices.jsx';

function Editor({ c, onDone }) {
  const [v, setV] = useState({ name: c.name || '', email: c.email || '', phone: c.phone || '', instagram: c.instagram || '', address: c.address || '', notes: c.notes || '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    try {
      await api(`/clients/${c.id}`, { method: 'PATCH', body: v });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };
  const f = (k, label, props = {}) => (
    <div className="field"><label htmlFor={`cl-${k}`}>{label}</label>
      {props.rows ? <textarea id={`cl-${k}`} className="input" value={v[k]} onChange={set(k)} {...props} />
        : <input id={`cl-${k}`} className="input" value={v[k]} onChange={set(k)} {...props} />}
    </div>
  );
  return (
    <form className="card" onSubmit={save}>
      <h3>Edit client</h3>
      {f('name', 'Name', { required: true })}
      {f('email', 'Email', { type: 'email' })}
      {f('phone', 'Phone', { type: 'tel' })}
      {f('instagram', 'Instagram', { placeholder: '@handle', autoCapitalize: 'none' })}
      {f('address', 'Address (goes on invoices)', { rows: 2 })}
      {f('notes', 'Notes (only you see these)', { rows: 3, placeholder: 'e.g. Always pays late, loves disco, the manager is Sam' })}
      <div className="btn-row"><button className="btn primary" style={{ flex: 1 }}>Save</button><button type="button" className="btn" onClick={onDone}>Cancel</button></div>
      {error && <div className="msg err">{error}</div>}
    </form>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const load = () => api(`/clients/${id}`).then(setC).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const newInvoice = async () => {
    try {
      const r = await api(`/clients/${id}/invoice`, { method: 'POST' });
      navigate(`/invoices/${r.id}`);
    } catch (err) {
      setError(err.message);
    }
  };
  const remove = async () => {
    if (!confirm(`Delete ${c.name}'s profile? Their bookings and invoices are kept.`)) return;
    await api(`/clients/${id}`, { method: 'DELETE' });
    navigate('/clients', { replace: true });
  };

  if (!c) return error ? <div className="msg err">{error}</div> : null;
  if (editing) return <Editor c={c} onDone={() => { setEditing(false); load(); }} />;

  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <button className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <div className="row-main">
          <div className="row-title" style={{ fontSize: 22, whiteSpace: 'normal' }}>{c.name}</div>
          <div className="row-sub">{[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details yet'}</div>
        </div>
        <button className="icon-btn" aria-label="Edit" onClick={() => setEditing(true)}><Pencil size={18} /></button>
      </div>

      <ContactButtons b={{ client_phone: c.phone, client_email: c.email, instagram: c.instagram }} />

      <div className="stats" style={{ marginTop: 12, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat"><div className="stat-label">Gigs</div><div className="stat-value">{c.stats.gigs}</div></div>
        <div className="stat"><div className="stat-label">Paid you</div><div className="stat-value">{moneyShort(c.stats.paidPence)}</div></div>
        <div className="stat"><div className="stat-label">Owes</div><div className={`stat-value${c.stats.overduePence ? ' red' : ''}`}>{moneyShort(c.stats.owedPence)}</div></div>
      </div>

      <div className="quick">
        <button className="btn primary" onClick={newInvoice}><Receipt size={18} /> New invoice</button>
        <Link className="btn" to={`/bookings/new?client=${c.id}`}><CalendarPlus size={18} /> New booking</Link>
      </div>
      {error && <div className="msg err">{error}</div>}

      {(c.address || c.notes) && (
        <div className="card" style={{ marginTop: 14 }}>
          {c.address && <div className="kv"><span>Address</span><span style={{ whiteSpace: 'pre-line' }}>{c.address}</span></div>}
          {c.notes && <p className="notes" style={{ marginTop: c.address ? 12 : 0 }}>{c.notes}</p>}
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Invoices</h2></div>
        <div className="list">
          {c.invoices.length ? c.invoices.map((i) => (
            <Link key={i.id} to={`/invoices/${i.id}`} className="row">
              <div className="row-main"><div className="row-title">{i.number}</div><div className="row-sub">{shortDate(i.issue_date)}</div></div>
              <div className="row-end"><div className="row-amount">{money(i.total_pence)}</div><span className={`pill ${INVOICE_STATE[i.state].tone}`}>{INVOICE_STATE[i.state].label}</span></div>
            </Link>
          )) : <div className="empty">No invoices yet.</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Bookings</h2></div>
        <div className="list">
          {c.bookings.length ? c.bookings.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="row">
              <div className="row-main"><div className="row-title">{b.event_type || 'Booking'}</div><div className="row-sub">{shortDate(b.event_date)}{b.venue_name ? ` · ${b.venue_name}` : ''}</div></div>
              <span className={`pill ${STATUS_INFO[b.status].tone}`}>{STATUS_INFO[b.status].label}</span>
            </Link>
          )) : <div className="empty">No bookings yet.</div>}
        </div>
      </div>

      <button className="btn danger block" style={{ marginTop: 28 }} onClick={remove}>Delete profile</button>
    </>
  );
}
