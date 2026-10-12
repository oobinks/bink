// The public enquiry form clients fill in (the link you send out: /book).
// The questions come from Settings → Booking form.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const today = () => new Date().toISOString().slice(0, 10);

function Choice({ name, value, options, onChange, multi }) {
  const picked = multi ? value || [] : value;
  const toggle = (v) => (multi ? onChange(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]) : onChange(v));
  return (
    <div className="choices" role={multi ? 'group' : 'radiogroup'} aria-label={name}>
      {options.map((o) => {
        const on = multi ? picked.includes(o.value) : picked === o.value;
        return (
          <button type="button" key={o.value} role={multi ? 'checkbox' : 'radio'} aria-checked={on}
            className={`chip${on ? ' active' : ''}`} onClick={() => toggle(o.value)}>{multi && on ? '✓ ' : ''}{o.label}</button>
        );
      })}
    </div>
  );
}

function Input({ f, value, onChange }) {
  const common = { id: f.id, className: 'input', value: value ?? '', onChange: (e) => onChange(e.target.value), required: f.required };
  switch (f.type) {
    case 'long': return <textarea rows={f.id === 'venue_address' ? 2 : 3} {...common} />;
    case 'date': return <input type="date" min={f.id === 'event_date' ? today() : undefined} {...common} />;
    case 'time': return <input type="time" {...common} />;
    case 'number': return <input type="number" inputMode="numeric" min="0" {...common} />;
    case 'money': return <input inputMode="decimal" placeholder="£" {...common} />;
    case 'email': return <input type="email" autoComplete={f.core ? 'email' : undefined} {...common} />;
    case 'phone': return <input type="tel" autoComplete={f.core ? 'tel' : undefined} {...common} />;
    case 'dropdown':
      return (
        <select {...common}>
          <option value="">Choose…</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'choice': return <Choice name={f.label} value={value} options={f.options} onChange={onChange} />;
    case 'checkboxes': return <Choice name={f.label} value={value} options={f.options} onChange={onChange} multi />;
    default:
      return <input autoComplete={f.id === 'client_name' ? 'name' : undefined}
        autoCapitalize={f.id === 'instagram' ? 'none' : undefined} placeholder={f.id === 'instagram' ? '@yourname' : undefined} {...common} />;
  }
}

function Question({ f, value, onChange }) {
  return (
    <div className="field">
      <label htmlFor={f.id}>{f.label}{f.required && <span className="req"> *</span>}</label>
      {f.hint && <span className="hint">{f.hint}</span>}
      <Input f={f} value={value} onChange={onChange} />
    </div>
  );
}

const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

export default function BookingForm() {
  const [form, setForm] = useState(null);
  const [v, setV] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => { api('/public/form').then(setForm).catch(() => setForm({ title: 'Booking enquiry', intro: '', fields: [] })); }, []);
  useEffect(() => { document.title = form?.title || 'Booking enquiry'; }, [form]);
  if (!form) return null;

  const asksContact = form.fields.some((f) => f.id === 'contact_method');
  // The Instagram question only appears when they choose Instagram as their contact method.
  const visible = form.fields.filter((f) => f.id !== 'instagram' || !asksContact || v.contact_method === 'instagram');
  const isRequired = (f) => (f.id === 'instagram' && asksContact ? true : f.required);
  const set = (id) => (val) => setV((o) => ({ ...o, [id]: val }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const missing = visible.find((f) => isRequired(f) && isBlank(v[f.id]));
    if (missing) return setError(`Please answer: ${missing.label}`);
    setBusy(true);
    try {
      const body = { ...v };
      if (!isBlank(v.budget_pence)) {
        const pounds = parseFloat(String(v.budget_pence).replace(/[£,]/g, ''));
        body.budget_pence = Number.isFinite(pounds) ? Math.round(pounds * 100) : null;
      }
      const res = await api('/public/enquiry', { method: 'POST', body });
      setDone(res.message || 'Thanks! Your enquiry has been sent.');
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  // Show start and finish times side by side when they're next to each other.
  const rows = [];
  for (let i = 0; i < visible.length; i++) {
    const f = visible[i];
    const next = visible[i + 1];
    if (f.type === 'time' && next?.type === 'time') {
      rows.push(<div className="grid-2" key={f.id}>
        <Question f={{ ...f, required: isRequired(f) }} value={v[f.id]} onChange={set(f.id)} />
        <Question f={{ ...next, required: isRequired(next) }} value={v[next.id]} onChange={set(next.id)} />
      </div>);
      i++;
    } else {
      rows.push(<Question key={f.id} f={{ ...f, required: isRequired(f) }} value={v[f.id]} onChange={set(f.id)} />);
    }
  }

  return (
    <div className="public">
      <header className="public-head">
        <div className="wordmark"><span>{form.djName || 'ctrinn'}</span></div>
        <h1>{form.title}</h1>
        {!done && form.intro && <p className="intro">{form.intro}</p>}
      </header>

      {done ? (
        <div className="card done-card">
          <div className="done-icon">🪩</div>
          <h3>{done}</h3>
          <p className="lead">Any questions in the meantime: <a href={`mailto:${form.email}`}>{form.email}</a></p>
        </div>
      ) : (
        <form className="card" onSubmit={submit} noValidate>
          <p className="hint" style={{ marginTop: 0 }}><span className="req">*</span> Indicates required question</p>
          {rows}
          {/* Hidden from people; only spam robots fill this in. */}
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={v.website || ''} onChange={(e) => set('website')(e.target.value)} />
          <button className="btn primary block" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'}</button>
          {error && <div className="msg err">{error}</div>}
        </form>
      )}
    </div>
  );
}
