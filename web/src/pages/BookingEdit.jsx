// Add a booking by hand: a private party enquiry (e.g. someone rang you) or a club set; or edit a booking's details.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PartyPopper, Disc3, UserPlus, Search } from 'lucide-react';
import { api } from '../api.js';
import { ClientPicker, NewClientForm } from './Clients.jsx';
import { fromPence, toPence } from '../format.js';

const FIELDS = ['client_name', 'event_type', 'event_date', 'start_time', 'end_time', 'venue_name', 'venue_address',
  'equipment', 'guests', 'contact_method', 'client_phone', 'client_email', 'instagram', 'notes'];

// Who pays you for a club set: pick one of your clients, or add a new one.
function ClientChooser({ client, onChange }) {
  const [mode, setMode] = useState(client ? null : 'pick');
  const choose = async (id) => {
    const c = await api(`/clients/${id}`);
    onChange({ id: c.id, name: c.name, email: c.email, phone: c.phone });
    setMode(null);
  };
  if (client && !mode) {
    return (
      <div className="field">
        <label>Client (who pays you) *</label>
        <div className="chosen-client">
          <div className="row-main">
            <div className="row-title">{client.name}</div>
            <div className="row-sub">{client.email || 'No email yet: add it on their profile so you can email the invoice'}</div>
          </div>
          <button type="button" className="btn small" onClick={() => setMode('pick')}>Change</button>
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <label>Client (who pays you) *</label>
      <div className="segmented" style={{ marginBottom: 10 }}>
        <button type="button" className={mode === 'pick' ? 'active' : ''} onClick={() => setMode('pick')}><Search size={16} /> Your clients</button>
        <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}><UserPlus size={16} /> New client</button>
      </div>
      {mode === 'new'
        ? <NewClientForm cta="Add client" onCreated={choose} />
        : <div className="client-pick-list"><ClientPicker onPick={(c) => choose(c.id)} /></div>}
      {client && <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={() => setMode(null)}>Keep {client.name}</button>}
    </div>
  );
}

export default function BookingEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState(id ? null : {});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const [kind, setKind] = useState(params.get('kind') === 'club' ? 'club' : 'party');
  const [client, setClient] = useState(null);
  const club = kind === 'club';

  const fromClient = params.get('client');
  useEffect(() => {
    if (!id && fromClient) {
      api(`/clients/${fromClient}`).then((c) => setV((o) => ({
        ...o, client_name: c.name, client_email: c.email || '', client_phone: c.phone || '', instagram: c.instagram || '',
      }))).catch(() => {});
    }
    if (id) {
      api(`/bookings/${id}`).then((b) => {
        setKind(b.kind || 'party');
        if (b.client_id) setClient({ id: b.client_id, name: b.client_name, email: b.client_email, phone: b.client_phone });
        setV({ ...Object.fromEntries(FIELDS.map((k) => [k, b[k] ?? ''])), budget: fromPence(b.budget_pence) });
      });
    }
  }, [id, fromClient]);

  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }));
  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      {props.rows
        ? <textarea id={k} className="input" value={v[k] ?? ''} onChange={set(k)} {...props} />
        : <input id={k} className="input" value={v[k] ?? ''} onChange={set(k)} {...props} />}
    </div>
  );
  const select = (k, label, options) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <select id={k} className="input" value={v[k] ?? ''} onChange={set(k)}>
        <option value="">—</option>
        {options.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
      </select>
    </div>
  );

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { ...Object.fromEntries(FIELDS.map((k) => [k, v[k] ?? ''])), budget_pence: toPence(v.budget) };
    if (club) {
      if (!client) {
        setError('Choose who pays you, or add them as a new client');
        setBusy(false);
        return;
      }
      // Their name and contact details come from the client profile.
      for (const k of ['client_name', 'client_email', 'client_phone']) delete body[k];
      body.client_id = client.id;
      if (!id) Object.assign(body, { kind: 'club', price_pence: toPence(v.fee) ?? 0 });
    }
    try {
      if (id) {
        await api(`/bookings/${id}`, { method: 'PATCH', body });
        navigate(`/bookings/${id}`, { replace: true });
      } else {
        const r = await api('/bookings', { method: 'POST', body });
        navigate(`/bookings/${r.id}`, { replace: true });
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (!v) return null;
  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to={id ? `/bookings/${id}` : '/bookings'} className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
        <h1 style={{ fontSize: 24 }}>{id ? 'Edit booking' : 'Add booking'}</h1>
      </div>
      {!id && (
        <div className="segmented">
          <button type="button" className={club ? '' : 'active'} onClick={() => setKind('party')}><PartyPopper size={16} /> Private party</button>
          <button type="button" className={club ? 'active' : ''} onClick={() => setKind('club')}><Disc3 size={16} /> Club set</button>
        </div>
      )}
      {club ? (
        <>
        {!id && <p className="lead">Already agreed, so it goes straight into Confirmed. Invoice it after the gig and payment reminders go out as usual.</p>}
        {/* Its own card (not inside the form below), so adding a client doesn't save the booking. */}
        <div className="card" style={{ marginBottom: 12 }}><ClientChooser client={client} onChange={setClient} /></div>
        <form className="card" onSubmit={save}>
          {field('venue_name', 'Club or venue *', { required: true })}
          <div className="grid-2">
            {field('event_date', 'Date *', { type: 'date', required: true })}
            {!id && field('fee', 'Fee *', { inputMode: 'decimal', placeholder: '£', required: true })}
          </div>
          <div className="grid-2">
            {field('start_time', 'Set starts', { type: 'time' })}
            {field('end_time', 'Set ends', { type: 'time' })}
          </div>
          {field('venue_address', 'Address', { rows: 2 })}
          {field('notes', 'Notes', { rows: 3, placeholder: 'e.g. Warm-up for the headliner, load-in 10pm' })}
          <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          {error && <div className="msg err">{error}</div>}
        </form>
        </>
      ) : (
      <form className="card" onSubmit={save}>
        {field('client_name', 'Client name *', { required: true, autoFocus: !id })}
        {field('event_type', 'Occasion', { placeholder: 'e.g. 30th birthday' })}
        {field('event_date', 'Date', { type: 'date' })}
        <div className="grid-2">
          {field('start_time', 'Start', { type: 'time' })}
          {field('end_time', 'Finish', { type: 'time' })}
        </div>
        {field('venue_name', 'Venue')}
        {field('venue_address', 'Address', { rows: 2 })}
        <div className="grid-2">
          {field('guests', 'Guests', { type: 'number', inputMode: 'numeric', min: 0 })}
          {field('budget', 'Budget', { inputMode: 'decimal', placeholder: '£' })}
        </div>
        {select('equipment', 'Needs speakers, lights & booth?', [['yes', 'Yes'], ['no', 'No'], ['not sure', 'Not sure']])}
        {select('contact_method', 'Best way to contact', [['email', 'Email'], ['phone', 'Phone / Text'], ['instagram', 'Instagram']])}
        {field('client_phone', 'Phone', { type: 'tel' })}
        {field('client_email', 'Email', { type: 'email' })}
        {field('instagram', 'Instagram', { placeholder: '@handle', autoCapitalize: 'none' })}
        {field('notes', 'Notes', { rows: 3 })}
        <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {error && <div className="msg err">{error}</div>}
      </form>
      )}
    </>
  );
}
