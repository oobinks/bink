// The public enquiry form clients fill in (the link you send out: /book).
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const today = () => new Date().toISOString().slice(0, 10);

function Choice({ name, value, options, onChange }) {
  return (
    <div className="choices" role="radiogroup" aria-label={name}>
      {options.map(([v, label]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v}
          className={`chip${value === v ? ' active' : ''}`} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

function Q({ label, hint, required, children, htmlFor }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}{required && <span className="req"> *</span>}</label>
      {hint && <span className="hint">{hint}</span>}
      {children}
    </div>
  );
}

export default function BookingForm() {
  const [form, setForm] = useState(null);
  const [v, setV] = useState({ equipment: '', contact_method: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e?.target ? e.target.value : e }));

  useEffect(() => { api('/public/form').then(setForm).catch(() => setForm({ title: 'Booking enquiry', intro: '' })); }, []);
  useEffect(() => { document.title = form?.title || 'Booking enquiry'; }, [form]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!v.equipment) return setError('Please say whether you need speakers, lights & DJ booth');
    if (!v.contact_method) return setError('Please choose your best method of communication');
    if (v.contact_method === 'instagram' && !v.instagram) return setError('Please add your Instagram handle');
    setBusy(true);
    try {
      const budget = v.budget ? Math.round(parseFloat(String(v.budget).replace(/[£,]/g, '')) * 100) : null;
      const res = await api('/public/enquiry', { method: 'POST', body: { ...v, budget_pence: Number.isFinite(budget) ? budget : null } });
      setDone(res.message || 'Thanks! Your enquiry has been sent.');
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  if (!form) return null;
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
        <form className="card" onSubmit={submit} noValidate={false}>
          <p className="hint" style={{ marginTop: 0 }}><span className="req">*</span> Indicates required question</p>

          <Q label="Full Name" required htmlFor="name">
            <input id="name" className="input" required autoComplete="name" value={v.client_name || ''} onChange={set('client_name')} />
          </Q>
          <Q label="Occasion" required hint="Example: 21st Birthday Party" htmlFor="occasion">
            <input id="occasion" className="input" required value={v.event_type || ''} onChange={set('event_type')} />
          </Q>
          <Q label="Date of Event" required htmlFor="date">
            <input id="date" className="input" type="date" required min={today()} value={v.event_date || ''} onChange={set('event_date')} />
          </Q>
          <div className="grid-2">
            <Q label="Start Time" required htmlFor="start">
              <input id="start" className="input" type="time" required value={v.start_time || ''} onChange={set('start_time')} />
            </Q>
            <Q label="Finish Time" required htmlFor="finish">
              <input id="finish" className="input" type="time" required value={v.end_time || ''} onChange={set('end_time')} />
            </Q>
          </div>
          <Q label="Location" required hint="The name of the venue or place" htmlFor="venue">
            <input id="venue" className="input" required value={v.venue_name || ''} onChange={set('venue_name')} />
          </Q>
          <Q label="Event Address" required hint="Including postcode" htmlFor="address">
            <textarea id="address" className="input" rows={2} required autoComplete="street-address" value={v.venue_address || ''} onChange={set('venue_address')} />
          </Q>
          <Q label="Do you need us to provide speakers, lights & DJ booth?" required>
            <Choice name="equipment" value={v.equipment} onChange={set('equipment')}
              options={[['yes', 'Yes'], ['no', 'No'], ['not sure', 'Not sure']]} />
          </Q>
          <Q label="Approximate Number of Attendees" required htmlFor="guests">
            <input id="guests" className="input" type="number" inputMode="numeric" min="1" required value={v.guests || ''} onChange={set('guests')} />
          </Q>
          <Q label="Best Method of Communication" required>
            <Choice name="contact" value={v.contact_method} onChange={set('contact_method')}
              options={[['email', 'Email'], ['phone', 'Phone / Text'], ['instagram', 'Instagram']]} />
          </Q>
          <Q label="Phone Number" required htmlFor="phone">
            <input id="phone" className="input" type="tel" required autoComplete="tel" value={v.client_phone || ''} onChange={set('client_phone')} />
          </Q>
          <Q label="Email Address" required htmlFor="email">
            <input id="email" className="input" type="email" required autoComplete="email" value={v.client_email || ''} onChange={set('client_email')} />
          </Q>
          {v.contact_method === 'instagram' && (
            <Q label="Instagram Handle" required htmlFor="ig">
              <input id="ig" className="input" placeholder="@yourname" autoCapitalize="none" value={v.instagram || ''} onChange={set('instagram')} />
            </Q>
          )}
          <Q label="Budget" hint="Optional" htmlFor="budget">
            <input id="budget" className="input" inputMode="decimal" placeholder="£" value={v.budget || ''} onChange={set('budget')} />
          </Q>
          <Q label="Anything else we should know?" hint="Optional: music you love, special requests" htmlFor="notes">
            <textarea id="notes" className="input" rows={3} value={v.notes || ''} onChange={set('notes')} />
          </Q>
          {/* Hidden from people; only spam robots fill this in. */}
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={v.website || ''} onChange={set('website')} />

          <button className="btn primary block" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'}</button>
          {error && <div className="msg err">{error}</div>}
        </form>
      )}
    </div>
  );
}
