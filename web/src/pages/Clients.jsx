import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Plus, ArrowLeft, ChevronRight, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { moneyShort } from '../format.js';

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export function ClientPicker({ onPick, busy }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api('/clients').then(setList).catch(() => setList([])); }, []);
  const term = q.trim().toLowerCase();
  const shown = (list || []).filter((c) => !term || [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(term)));
  return (
    <>
      <div className="search">
        <Search size={18} />
        <input className="input" placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={false} />
      </div>
      <div className="list">
        {shown.map((c) => (
          <button key={c.id} className="row row-btn" disabled={busy} onClick={() => onPick(c)}>
            <div className="avatar">{initials(c.name)}</div>
            <div className="row-main">
              <div className="row-title">{c.name}</div>
              <div className="row-sub">
                {[c.gigs ? `${c.gigs} gig${c.gigs === 1 ? '' : 's'}` : 'No gigs yet', c.email].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="row-end">
              {c.owed_pence > 0 ? <span className="pill gold">{moneyShort(c.owed_pence)} owed</span>
                : c.paid_pence > 0 ? <div className="row-sub">{moneyShort(c.paid_pence)} paid</div> : null}
            </div>
            <ChevronRight size={18} color="var(--faint)" />
          </button>
        ))}
        {list && !shown.length && <div className="empty">{term ? `No client called "${q}" yet.` : 'No clients yet.'}</div>}
      </div>
    </>
  );
}

export function NewClientForm({ onCreated, initialName = '', cta = 'Save client' }) {
  const [v, setV] = useState({ name: initialName, email: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api('/clients', { method: 'POST', body: v });
      await onCreated(id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3>New client</h3>
      <div className="field"><label htmlFor="nc-name">Name</label><input id="nc-name" className="input" required value={v.name} onChange={set('name')} autoFocus /></div>
      <div className="field"><label htmlFor="nc-email">Email</label><input id="nc-email" className="input" type="email" value={v.email} onChange={set('email')} /></div>
      <div className="field"><label htmlFor="nc-phone">Phone</label><input id="nc-phone" className="input" type="tel" value={v.phone} onChange={set('phone')} /></div>
      <button className="btn primary block" disabled={busy || !v.name.trim()}>{busy ? 'Saving…' : cta}</button>
      {error && <div className="msg err">{error}</div>}
    </form>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="page-head">
        <div className="chat-head">
          <Link to="/invoices" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
          <h1 style={{ fontSize: 26 }}>Clients</h1>
        </div>
        <button className="btn small primary" onClick={() => setAdding((a) => !a)}><Plus size={16} /> New</button>
      </div>
      {adding && <div style={{ marginBottom: 14 }}><NewClientForm onCreated={(id) => navigate(`/clients/${id}`)} /></div>}
      <ClientPicker onPick={(c) => navigate(`/clients/${c.id}`)} />
    </>
  );
}

export function InvoiceNew() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const start = async (clientId) => {
    setBusy(true);
    try {
      const { id } = await api(`/clients/${clientId}/invoice`, { method: 'POST' });
      navigate(`/invoices/${id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to="/invoices" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
        <h1 style={{ fontSize: 24 }}>New invoice: who for?</h1>
      </div>
      {adding
        ? <div style={{ marginBottom: 14 }}><NewClientForm cta="Save and create invoice" onCreated={start} /></div>
        : <button className="btn block" style={{ marginBottom: 14 }} onClick={() => setAdding(true)}><UserPlus size={18} /> New client</button>}
      {error && <div className="msg err">{error}</div>}
      <ClientPicker busy={busy} onPick={(c) => start(c.id)} />
      <p className="hint" style={{ textAlign: 'center' }}>Repeat clients get their details and last invoice's lines filled in.</p>
    </>
  );
}
