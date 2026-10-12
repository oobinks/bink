import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Mail, Send, FileDown, Link2, ExternalLink, BellOff, Bell, Pencil, X, Plus, Undo2 } from 'lucide-react';
import { api } from '../api.js';
import { money, fromPence, toPence, longDate } from '../format.js';
import { invoicePdf, downloadBlob, blobToBase64 } from '../pdf.js';
import { shareOrCopy, shareFile } from '../share.js';
import { INVOICE_STATE } from './Invoices.jsx';

const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// The same shape the client's invoice page uses, so the PDF looks identical.
function pdfData(inv, s) {
  return {
    business: s.business, bank: s.bank, reference: inv.number, vatNote: s.invoicing.vatNote,
    paymentTermsDays: s.invoicing.paymentTermsDays, number: inv.number, client: inv.client_name,
    clientEmail: inv.client_email, clientAddress: inv.client_address, issueDate: inv.issue_date, dueDate: inv.due_date,
    items: inv.items, totalPence: inv.total_pence, notes: inv.notes, paidOn: inv.paid_at ? inv.paid_at.slice(0, 10) : null,
  };
}

function Editor({ inv, onSaved, onCancel }) {
  const [v, setV] = useState({
    client_name: inv.client_name || '', client_email: inv.client_email || '', client_address: inv.client_address || '',
    issue_date: inv.issue_date, due_date: inv.due_date, notes: inv.notes || '',
    items: inv.items.map((i) => ({ description: i.description, amount: fromPence(i.pence) })),
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }));
  const setItem = (i, k) => (e) => setV((o) => ({ ...o, items: o.items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }));
  const total = v.items.reduce((a, i) => a + (toPence(i.amount) || 0), 0);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api(`/invoices/${inv.id}`, {
        method: 'PATCH',
        body: { ...v, items: v.items.map((i) => ({ description: i.description, pence: toPence(i.amount) ?? -1 })) },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="card" onSubmit={save}>
      <h3>Edit invoice</h3>
      <div className="field"><label htmlFor="cn">Client name</label><input id="cn" className="input" value={v.client_name} onChange={set('client_name')} /></div>
      <div className="field"><label htmlFor="ce">Client email</label><input id="ce" className="input" type="email" value={v.client_email} onChange={set('client_email')} /></div>
      <div className="field"><label htmlFor="ca">Client address (optional)</label><textarea id="ca" className="input" rows={2} value={v.client_address} onChange={set('client_address')} /></div>
      <div className="grid-2">
        <div className="field"><label htmlFor="id">Invoice date</label><input id="id" className="input" type="date" value={v.issue_date} onChange={set('issue_date')} /></div>
        <div className="field"><label htmlFor="dd">Due date</label><input id="dd" className="input" type="date" value={v.due_date} onChange={set('due_date')} /></div>
      </div>
      <label className="hint" style={{ fontWeight: 600 }}>Lines</label>
      {v.items.map((it, i) => (
        <div className="extra-row" key={i}>
          <input className="input" value={it.description} aria-label="Description" onChange={setItem(i, 'description')} />
          <input className="input amount" inputMode="decimal" value={it.amount} aria-label="Amount" onChange={setItem(i, 'amount')} />
          <button type="button" className="icon-btn" aria-label="Remove" disabled={v.items.length === 1}
            onClick={() => setV((o) => ({ ...o, items: o.items.filter((_, j) => j !== i) }))}><X size={16} /></button>
        </div>
      ))}
      <button type="button" className="chip" onClick={() => setV((o) => ({ ...o, items: [...o.items, { description: '', amount: '' }] }))}><Plus size={14} /> Add line</button>
      <div className="field" style={{ marginTop: 14 }}><label htmlFor="nt">Note on the invoice (optional)</label><textarea id="nt" className="input" rows={2} value={v.notes} onChange={set('notes')} /></div>
      <div className="quote-total"><span>Total</span><b>{money(total)}</b></div>
      <div className="btn-row">
        <button className="btn primary" style={{ flex: 1 }}>Save</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
      {error && <div className="msg err">{error}</div>}
    </form>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  const load = () => api(`/invoices/${id}`).then(setInv).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => {
    load();
    api('/settings').then(setSettings).catch(() => {});
  }, [id]);

  if (!inv || !settings) return msg ? <div className="msg err">{msg.text}</div> : null;
  const s = INVOICE_STATE[inv.state];
  const link = `${window.location.origin}/i/${inv.token}`;
  const pdfName = `${settings.business.djName}-invoice-${inv.number}.pdf`;
  const makePdf = () => invoicePdf(pdfData(inv, settings), link);
  const bankMissing = !settings.bank.sortCode || !settings.bank.accountNumber;

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
  const markSent = () => api(`/invoices/${inv.id}/send`, { method: 'POST', body: { method: 'manual' } });

  const emailNow = run('email', async () => {
    if (!inv.client_email) throw new Error("Add the client's email first (tap Edit)");
    const pdf = await blobToBase64(await makePdf());
    await api(`/invoices/${inv.id}/send`, { method: 'POST', body: { method: 'email', pdf } });
    setMsg({ ok: true, text: `Emailed to ${inv.client_email} from your Gmail` });
    load();
  });
  const emailYourself = run('mailto', async () => {
    await markSent();
    const vars = {
      first_name: inv.client_name.split(' ')[0], client_name: inv.client_name, number: inv.number, amount: money(inv.total_pence),
      due_date: longDate(inv.due_date), issue_date: longDate(inv.issue_date), event: inv.booking?.event_type ? `your ${inv.booking.event_type.toLowerCase()}` : 'your event',
      link, dj_name: settings.business.djName,
    };
    window.location.href = `mailto:${inv.client_email || ''}?subject=${encodeURIComponent(fill(settings.emails.invoiceSubject, vars))}&body=${encodeURIComponent(fill(settings.emails.invoiceBody, vars))}`;
    load();
  });
  const shareLink = run('share', async () => {
    await markSent();
    const r = await shareOrCopy({ title: `Invoice ${inv.number}`, text: `Hi ${inv.client_name.split(' ')[0]}, here's your invoice (${money(inv.total_pence)}):`, url: link });
    if (r === 'copied') setMsg({ ok: true, text: 'Invoice link copied. Paste it into a message.' });
    load();
  });
  const pdf = run('pdf', async () => {
    const blob = await makePdf();
    if (!(await shareFile(blob, pdfName, `Invoice ${inv.number}`))) downloadBlob(blob, pdfName);
  });
  const paid = run('paid', async () => {
    await api(`/invoices/${inv.id}/paid`, { method: 'POST', body: { paid: inv.state !== 'paid' } });
    setMsg({ ok: true, text: inv.state !== 'paid' ? 'Marked as paid 🎉' : 'Marked as unpaid' });
    load();
  });
  const pause = run('pause', async () => {
    await api(`/invoices/${inv.id}/chasing`, { method: 'POST', body: { paused: !inv.chasing_paused } });
    load();
  });
  const remove = async () => {
    if (!confirm(`Delete invoice ${inv.number}? This can't be undone.`)) return;
    await api(`/invoices/${inv.id}`, { method: 'DELETE' });
    navigate('/invoices', { replace: true });
  };

  const done = new Map(inv.reminders.map((r) => [r.step, r]));
  const chaseOn = settings.emails.chaseOn;

  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to="/invoices" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
        <div className="row-main">
          <div className="row-title" style={{ fontSize: 20 }}>{inv.client_name}</div>
          <span className={`pill ${s.tone}`}>{s.label}</span>
          <span className="row-sub" style={{ marginLeft: 8 }}>{inv.number}</span>
        </div>
        {!editing && <button className="icon-btn" aria-label="Edit" onClick={() => setEditing(true)}><Pencil size={18} /></button>}
      </div>

      {editing ? <Editor inv={inv} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} /> : (
        <>
          <div className="card invoice-hero">
            <div className="stat-label">{inv.state === 'paid' ? 'Paid' : 'Amount due'}</div>
            <div className="invoice-amount">{money(inv.total_pence)}</div>
            <div className="row-sub">
              {inv.state === 'paid' ? `Paid on ${longDate(inv.paid_at.slice(0, 10))}` : `Due ${longDate(inv.due_date)}`}
              {inv.viewed_at && inv.state !== 'paid' && ' · client has opened it'}
            </div>
            {inv.state !== 'draft' && (
              <button className={`btn block${inv.state === 'paid' ? '' : ' primary'}`} style={{ marginTop: 14 }} disabled={!!busy} onClick={paid}>
                {inv.state === 'paid' ? <><Undo2 size={18} /> Mark as unpaid</> : <><Check size={18} /> Mark as paid</>}
              </button>
            )}
          </div>

          {bankMissing && inv.state !== 'paid' && (
            <Link to="/settings?tab=bank" className="warn" style={{ marginTop: 12 }}>Your bank details aren't set yet, so clients won't know where to pay. Tap to add them.</Link>
          )}

          <div className="card" style={{ marginTop: 12 }}>
            <h3>{inv.state === 'draft' ? 'Send it' : 'Send again'}</h3>
            {inv.emailReady ? (
              <>
                <p className="lead">Emails it from your Gmail with the PDF attached{inv.client_email ? ` to ${inv.client_email}` : ''}.</p>
                <button className="btn primary block" disabled={!!busy} onClick={emailNow}><Mail size={18} /> {busy === 'email' ? 'Sending…' : 'Email invoice'}</button>
                <div className="send-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <button className="btn" disabled={!!busy} onClick={shareLink}><Send size={18} /> Share link</button>
                  <button className="btn" disabled={!!busy} onClick={pdf}><FileDown size={18} /> PDF</button>
                </div>
              </>
            ) : (
              <>
                <p className="lead">Send it from your own email or share the link. Once Gmail is connected, the app can email it and chase it for you (<Link to="/settings?tab=email" style={{ color: 'var(--gold)' }}>set up</Link>).</p>
                <div className="send-grid">
                  <button className="btn primary" disabled={!!busy} onClick={emailYourself}><Mail size={18} /> Email</button>
                  <button className="btn" disabled={!!busy} onClick={shareLink}><Send size={18} /> Share link</button>
                  <button className="btn" disabled={!!busy} onClick={pdf}><FileDown size={18} /> PDF</button>
                  {inv.state === 'draft' && <button className="btn" disabled={!!busy} onClick={run('mark', async () => { await markSent(); load(); })}><Check size={18} /> Mark sent</button>}
                </div>
              </>
            )}
            {inv.state !== 'draft' && <a className="hint view-link" href={link} target="_blank" rel="noreferrer"><Link2 size={13} /> View what the client sees <ExternalLink size={12} /></a>}
            {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            {inv.items.map((i, n) => <div className="kv" key={n}><span>{i.description}</span><span className="row-amount">{money(i.pence)}</span></div>)}
            <div className="kv"><span>Invoice date</span><span>{longDate(inv.issue_date)}</span></div>
            {inv.client_email && <div className="kv"><span>Client email</span><span>{inv.client_email}</span></div>}
            {inv.booking && <Link className="hint view-link" to={`/bookings/${inv.booking.id}`}>View the booking</Link>}
          </div>

          {inv.state !== 'draft' && inv.state !== 'paid' && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row-head">
                <h3>Payment reminders</h3>
                <button className="btn small" disabled={!!busy || !chaseOn} onClick={pause}>
                  {inv.chasing_paused ? <><Bell size={15} /> Resume</> : <><BellOff size={15} /> Pause</>}
                </button>
              </div>
              {!chaseOn && <p className="lead">Reminders are switched off in Settings → Emails.</p>}
              {inv.chasing_paused ? <p className="lead">Paused for this invoice.</p> : chaseOn && settings.emails.steps.map((st, i) => {
                if (!st.on) return null;
                const when = addDays(inv.due_date, st.days);
                const r = done.get(i);
                const label = st.days < 0 ? `${-st.days} days before due` : st.days === 0 ? 'On the due date' : `${st.days} days overdue`;
                const status = r ? { email: 'Emailed', notified: 'You were reminded', skipped: 'Skipped' }[r.method] : inv.emailReady ? 'Will email' : 'Will remind you';
                return <div className="kv" key={i}><span>{label} · {new Date(when + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span><span>{status}</span></div>;
              })}
            </div>
          )}

          <button className="btn danger block" style={{ marginTop: 28 }} onClick={remove}>Delete invoice</button>
        </>
      )}
    </>
  );
}
