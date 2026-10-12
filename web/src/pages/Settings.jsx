import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { fromPence, toPence } from '../format.js';
import { pushSupport, pushEnabled, enablePush } from '../push.js';
import { shareOrCopy } from '../share.js';
import FormBuilder from './FormBuilder.jsx';

const TABS = [
  { id: 'business', label: 'Your details' },
  { id: 'pricing', label: 'Prices' },
  { id: 'form', label: 'Booking form' },
  { id: 'email', label: 'Emails & reminders' },
  { id: 'phone', label: 'Phone & calendar' },
  { id: 'bank', label: 'Bank details' },
  { id: 'invoicing', label: 'Invoicing' },
  { id: 'data', label: 'Backups & export' },
  { id: 'history', label: 'History' },
  { id: 'security', label: 'Security' },
];

function useSave(section, onSaved) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (values) => {
    setBusy(true);
    setMsg(null);
    try {
      const saved = await api(`/settings/${section}`, { method: 'PUT', body: values });
      onSaved?.(saved);
      setMsg({ ok: true, text: 'Saved' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy(false);
  };
  return { save, msg, busy };
}

function Field({ label, hint, value, onChange, type = 'text', id: givenId, ...rest }) {
  const id = givenId || label.toLowerCase().replace(/\W+/g, '-');
  const Tag = type === 'textarea' ? 'textarea' : 'input';
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Tag id={id} className="input" type={type === 'textarea' ? undefined : type} rows={type === 'textarea' ? 3 : undefined}
        value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function SaveBar({ busy, msg }) {
  return (
    <>
      <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </>
  );
}

function SectionForm({ section, initial, title, lead, children }) {
  const [v, setV] = useState(initial);
  const { save, msg, busy } = useSave(section, setV);
  const set = (k) => (val) => setV((old) => ({ ...old, [k]: val }));
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); save(v); }}>
      <h3>{title}</h3>
      {lead && <p className="lead">{lead}</p>}
      {children(v, set)}
      <SaveBar busy={busy} msg={msg} />
    </form>
  );
}

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const t = String(v);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The zip is built here on your device (keeps the free server plan happy).
async function exportEverything() {
  const [{ zipSync, strToU8 }, data] = await Promise.all([import('fflate'), api('/settings/export')]);
  const files = {
    'everything.json': strToU8(JSON.stringify(data, null, 2)),
    'README.txt': strToU8(
      'Your ctrinn DJ HQ export.\n\n' +
      '- everything.json: every record and setting\n' +
      '- csv/: one spreadsheet per section (opens in Excel, Numbers or Google Sheets)\n'
    ),
  };
  for (const [table, rows] of Object.entries(data.tables)) files[`csv/${table}.csv`] = strToU8(toCSV(rows));
  download(`ctrinn-export-${data.exportedAt.slice(0, 10)}.zip`, new Blob([zipSync(files)], { type: 'application/zip' }));
}

const fmtTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function DataTab({ settings, reload }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [backups, setBackups] = useState([]);
  const b = settings.backups;
  const loadBackups = () => api('/settings/backups').then(setBackups).catch(() => {});
  useEffect(() => { loadBackups(); }, []);

  const run = (label, fn, okText) => async () => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ ok: true, text: okText });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy('');
  };

  const sample = async (action) => {
    if (action === 'clear' && !confirm('Remove all the sample bookings, invoices and clips? Your real data is not touched.')) return;
    await api('/settings/sample-data', { method: 'POST', body: { action } });
    reload();
  };

  return (
    <>
      <div className="card">
        <h3>Backups</h3>
        <p className="lead">
          Your data is saved in Cloudflare's cloud, which can rewind it to any minute in the last 7 days. On top of that,
          the app saves a full copy every night and keeps the last 30.
        </p>
        <div className="kv"><span>Last backup</span><span>{b.lastBackupAt ? fmtTime(b.lastBackupAt) : 'Not yet'}</span></div>
        {b.lastBackupError && <div className="msg err">Last problem: {b.lastBackupError}</div>}
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={!!busy}
            onClick={run('backup', async () => { await api('/settings/backup-now', { method: 'POST' }); reload(); loadBackups(); }, 'Backup saved')}>
            {busy === 'backup' ? 'Backing up…' : 'Back up now'}
          </button>
        </div>
        {backups.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {backups.slice(0, 5).map((k) => (
              <div className="kv" key={k.key}>
                <span>{fmtTime(k.at)}</span>
                <span><a style={{ color: 'var(--gold)' }} href={`/api/settings/backups/${encodeURIComponent(k.key)}`}>Download</a></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Export everything</h3>
        <p className="lead">One zip file with all your bookings, invoices and clips as spreadsheets, plus a complete data file.</p>
        <button className="btn block" disabled={!!busy} onClick={run('export', exportEverything)}>
          {busy === 'export' ? 'Preparing…' : 'Download export'}
        </button>
        {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Sample data</h3>
        <p className="lead">
          {settings.meta.hasSampleData
            ? 'Pretend bookings, invoices and clips are loaded so you can see how things work. Remove them when you start using the app for real.'
            : 'No sample data loaded.'}
        </p>
        {settings.meta.hasSampleData
          ? <button className="btn danger block" onClick={() => sample('clear')}>Remove sample data</button>
          : <button className="btn block" onClick={() => sample('load')}>Load sample data</button>}
      </div>
    </>
  );
}

function HistoryTab() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/settings/activity').then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return null;
  return (
    <div className="list">
      {rows.length ? rows.map((r) => (
        <div className="row" key={r.id}>
          <div className="row-main">
            <div className="row-title">{r.action}</div>
            {r.detail && <div className="row-sub">{r.detail}</div>}
          </div>
          <div className="row-end row-sub">{fmtTime(r.at)}</div>
        </div>
      )) : <div className="empty">Nothing yet.</div>}
    </div>
  );
}

function PricingTab({ settings, reload }) {
  const p = settings.pricing;
  const [presets, setPresets] = useState(p.presets.map((x) => ({ name: x.name, amount: fromPence(x.pence) })));
  const [rates, setRates] = useState({
    extraHour: fromPence(p.extraHourPence), equipment: fromPence(p.equipmentPence),
    perMile: fromPence(p.travelPerMilePence), freeMiles: String(p.freeMiles), deposit: fromPence(p.depositPence),
  });
  const { save, msg, busy } = useSave('pricing', reload);
  const setRate = (k) => (val) => setRates((r) => ({ ...r, [k]: val }));
  const submit = (e) => {
    e.preventDefault();
    save({
      presets: presets.filter((x) => x.name.trim()).map((x) => ({ name: x.name, pence: toPence(x.amount) ?? -1 })),
      extraHourPence: toPence(rates.extraHour) ?? '', equipmentPence: toPence(rates.equipment) ?? '',
      travelPerMilePence: toPence(rates.perMile) ?? '', freeMiles: rates.freeMiles, depositPence: toPence(rates.deposit) ?? '',
    });
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3>Price presets</h3>
      <p className="lead">One tap on a booking fills in the price. Change them any time.</p>
      {presets.map((x, i) => (
        <div className="preset-row" key={i}>
          <input className="input" value={x.name} aria-label="Preset name" placeholder="e.g. Wedding (evening)"
            onChange={(e) => setPresets((l) => l.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} />
          <input className="input amount" inputMode="decimal" value={x.amount} aria-label="Price" placeholder="£"
            onChange={(e) => setPresets((l) => l.map((y, j) => j === i ? { ...y, amount: e.target.value } : y))} />
          <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setPresets((l) => l.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn small" style={{ marginBottom: 18 }} onClick={() => setPresets((l) => [...l, { name: '', amount: '' }])}>+ Add preset</button>

      <h3>Extras</h3>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <Field label="Extra hour (£)" inputMode="decimal" value={rates.extraHour} onChange={setRate('extraHour')} />
        <Field label="Speakers, lights & booth (£)" inputMode="decimal" value={rates.equipment} onChange={setRate('equipment')} />
        <Field label="Travel per mile (£)" inputMode="decimal" value={rates.perMile} onChange={setRate('perMile')} />
        <Field label="Free miles" inputMode="numeric" value={rates.freeMiles} onChange={setRate('freeMiles')} />
      </div>
      <h3 style={{ marginTop: 6 }}>Deposit</h3>
      <Field label="Deposit to secure a date (£)" inputMode="decimal" value={rates.deposit} onChange={setRate('deposit')}
        hint="Shown on every quote; the balance is paid on the night. Change it on any single quote, or set 0 for none." />
      <SaveBar busy={busy} msg={msg} />
    </form>
  );
}

function PhoneTab() {
  const [state, setState] = useState(pushSupport());
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState(null);
  const [cal, setCal] = useState('');
  useEffect(() => {
    pushEnabled().then(setOn);
    api('/calendar-link').then((r) => setCal(window.location.origin + r.path)).catch(() => {});
  }, []);
  const enable = async () => {
    setMsg(null);
    try {
      await enablePush();
      setOn(true);
      setMsg({ ok: true, text: 'Done. A test notification is on its way.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
      setState(pushSupport());
    }
  };
  const webcal = cal.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  return (
    <>
      <div className="card">
        <h3>Notifications on this device</h3>
        <p className="lead">Get a ping when a new enquiry arrives or a client accepts a quote. Turn it on for each phone or laptop.</p>
        {state === 'install-first' && <p className="lead">On iPhone, first add the app to your Home Screen (Safari → Share → Add to Home Screen), open it from there, then come back here.</p>}
        {state === 'blocked' && <p className="lead">Notifications are blocked for this app. Allow them in your phone or browser settings, then try again.</p>}
        {state === 'unsupported' && <p className="lead">This browser can't do notifications. Try Safari on iPhone or Chrome on Android.</p>}
        {state === 'ok' && (on
          ? <button className="btn block" onClick={enable}>✓ On. Send a test</button>
          : <button className="btn primary block" onClick={enable}>Turn on notifications</button>)}
        {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Gigs in your phone's calendar</h3>
        <p className="lead">Confirmed gigs appear in your normal calendar app and update by themselves. Keep this link private.</p>
        <div className="btn-row">
          <a className="btn primary" href={webcal}>Add to iPhone / Mac calendar</a>
          <a className="btn" href={google} target="_blank" rel="noreferrer">Add to Google Calendar</a>
        </div>
      </div>
    </>
  );
}

function FormTab({ settings, reload }) {
  const link = `${window.location.origin}/book`;
  const [copied, setCopied] = useState('');
  return (
    <>
      <div className="card">
        <h3>Your booking form link</h3>
        <p className="lead">Send this to anyone who wants to book you. It never changes.</p>
        <div className="kv"><span>Link</span><span><a href="/book" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>{link}</a></span></div>
        <button className="btn primary block" style={{ marginTop: 12 }}
          onClick={async () => setCopied(await shareOrCopy({ title: 'Booking enquiry', url: link }) === 'copied' ? 'Copied' : '')}>
          Share link
        </button>
        {copied && <div className="msg ok">{copied}</div>}
      </div>
      <div style={{ marginTop: 14 }}>
        <SectionForm section="bookingForm" initial={{ title: settings.bookingForm.title, intro: settings.bookingForm.intro, thanks: settings.bookingForm.thanks }} title="Wording on the form">
          {(v, set) => (
            <>
              <Field label="Title" value={v.title} onChange={set('title')} />
              <Field label="Intro" type="textarea" value={v.intro} onChange={set('intro')} />
              <Field label="Thank-you message" type="textarea" value={v.thanks} onChange={set('thanks')} />
            </>
          )}
        </SectionForm>
      </div>
      <FormBuilder settings={settings} reload={reload} />
    </>
  );
}

const PLACEHOLDERS = '{first_name} {client_name} {number} {amount} {due_date} {issue_date} {event} {link} {dj_name}';

function EmailTab({ settings, reload }) {
  const [ready, setReady] = useState(null);
  const [from, setFrom] = useState('');
  const [test, setTest] = useState(null);
  const [v, setV] = useState(settings.emails);
  const { save, msg, busy } = useSave('emails', (saved) => { setV(saved); reload(); });
  useEffect(() => { api('/email-status').then((r) => { setReady(r.ready); setFrom(r.from); }).catch(() => setReady(false)); }, []);
  const setStep = (i, k) => (val) => setV((o) => ({ ...o, steps: o.steps.map((st, j) => (j === i ? { ...st, [k]: val } : st)) }));
  const sendTest = async () => {
    setTest({ ok: true, text: 'Sending…' });
    try {
      await api('/invoices/test-email', { method: 'POST' });
      setTest({ ok: true, text: `Sent from ${from}. Check the inbox of ${settings.business.email}` });
    } catch (err) {
      setTest({ ok: false, text: err.message });
    }
  };
  const stepTitle = (d) => (d < 0 ? `${-d} days before the due date` : d === 0 ? 'On the due date' : `${d} days overdue`);

  return (
    <>
      <div className="card">
        <h3>Sending from Gmail</h3>
        {ready === null ? null : ready ? (
          <>
            <p className="lead">✅ Connected. Invoices and reminders are emailed from <b>{from}</b>, and show up in that Gmail's Sent folder. Replies go back to it too.</p>
            <button className="btn block" onClick={sendTest}>Send me a test email</button>
            {test && <div className={`msg ${test.ok ? 'ok' : 'err'}`}>{test.text}</div>}
          </>
        ) : (
          <>
            <p className="lead">Not connected yet. Until it is, you send invoices from your own email app (one tap), and on reminder days the app pings your phone so you can chase in one tap.</p>
            <p className="lead">To let the app email for you (takes 2 minutes):</p>
            <ol className="steps">
              <li>On <b>myaccount.google.com/security</b>, make sure <b>2-Step Verification</b> is on.</li>
              <li>Go to <b>myaccount.google.com/apppasswords</b>, type the name <b>DJ HQ</b>, and tap <b>Create</b>. Copy the 16-letter password.</li>
              <li>In Cloudflare: <b>Workers &amp; Pages → ctrinn-hq → Settings → Variables and Secrets → Add</b>. Set the type to <b>Secret</b>, the name to <b>GMAIL_APP_PASSWORD</b>, and paste the password. Tap <b>Deploy</b>.</li>
            </ol>
          </>
        )}
      </div>

      <form className="card" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); save(v); }}>
        <h3>Invoice email</h3>
        <p className="lead">Words in curly brackets are filled in for you: {PLACEHOLDERS}</p>
        <Field label="Subject" value={v.invoiceSubject} onChange={(x) => setV((o) => ({ ...o, invoiceSubject: x }))} />
        <Field label="Message" type="textarea" rows={8} value={v.invoiceBody} onChange={(x) => setV((o) => ({ ...o, invoiceBody: x }))} />

        <div className="row-head" style={{ marginTop: 18 }}>
          <h3>Payment reminders</h3>
          <label className="switch"><input type="checkbox" checked={v.chaseOn} onChange={(e) => setV((o) => ({ ...o, chaseOn: e.target.checked }))} /> {v.chaseOn ? 'On' : 'Off'}</label>
        </div>
        <p className="lead">Sent in the morning for unpaid invoices. You can pause them for any single invoice.</p>
        {v.chaseOn && v.steps.map((st, i) => (
          <details className="step" key={i} open={false}>
            <summary>
              <label className="switch" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={st.on} onChange={(e) => setStep(i, 'on')(e.target.checked)} />
              </label>
              <span>{stepTitle(Number(st.days))}</span>
            </summary>
            <Field id={`step${i}-days`} label="Days from due date (minus = before)" type="number" value={st.days} onChange={setStep(i, 'days')} />
            <Field id={`step${i}-subject`} label="Subject" value={st.subject} onChange={setStep(i, 'subject')} />
            <Field id={`step${i}-body`} label="Message" type="textarea" rows={7} value={st.body} onChange={setStep(i, 'body')} />
          </details>
        ))}
        <SaveBar busy={busy} msg={msg} />
      </form>
    </>
  );
}

function SecurityTab() {
  const everywhere = async () => {
    if (!confirm('Log out on every device, including this one?')) return;
    await api('/auth/logout-everywhere', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  };
  return (
    <div className="card">
      <h3>Password</h3>
      <p className="lead">
        For safety, your password is kept in your Cloudflare account rather than in the app. To change it: Cloudflare
        dashboard → Workers &amp; Pages → ctrinn-hq → Settings → Variables and Secrets → APP_PASSWORD → Edit. The new
        password works straight away.
      </p>
      <h3 style={{ marginTop: 8 }}>Lost your phone?</h3>
      <p className="lead">This logs out every device that's logged in. Then change your password as above.</p>
      <button className="btn danger block" onClick={everywhere}>Log out every device</button>
    </div>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'business';
  const [settings, setSettings] = useState(null);
  const reload = () => api('/settings').then(setSettings);
  useEffect(() => { reload(); }, []);
  if (!settings) return null;

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <div className="settings-nav">
        {TABS.map((t) => (
          <button key={t.id} className={`chip${tab === t.id ? ' active' : ''}`} onClick={() => setParams({ tab: t.id })}>{t.label}</button>
        ))}
      </div>

      {tab === 'business' && (
        <SectionForm section="business" initial={settings.business} title="Your details"
          lead="Shown on your quotes, invoices and press pack.">
          {(v, set) => (
            <>
              <div className="grid-2">
                <Field label="DJ name" value={v.djName} onChange={set('djName')} />
                <Field label="Name on invoices" value={v.legalName} onChange={set('legalName')} />
              </div>
              <Field label="Address" type="textarea" value={v.address} onChange={set('address')} />
              <Field label="Email" type="email" value={v.email} onChange={set('email')} />
              <Field label="Phone" type="tel" value={v.phone} onChange={set('phone')} />
              <Field label="Based in" value={v.baseLocation} onChange={set('baseLocation')} />
              <Field label="Genres" value={v.genres.join(', ')} hint="Separate with commas"
                onChange={(t) => set('genres')(t.split(',').map((s) => s.trimStart()))} />
            </>
          )}
        </SectionForm>
      )}

      {tab === 'bank' && (
        <SectionForm section="bank" initial={settings.bank} title="Bank details"
          lead="Printed on your invoices so clients know where to pay. Only you can see this screen.">
          {(v, set) => (
            <>
              <Field label="Account name" value={v.accountName} onChange={set('accountName')} />
              <Field label="Bank" value={v.bankName} onChange={set('bankName')} />
              <div className="grid-2">
                <Field label="Sort code" value={v.sortCode} onChange={set('sortCode')} inputMode="numeric" placeholder="00-00-00" />
                <Field label="Account number" value={v.accountNumber} onChange={set('accountNumber')} inputMode="numeric" />
              </div>
              <Field label="Payment reference" value={v.reference} onChange={set('reference')} />
            </>
          )}
        </SectionForm>
      )}

      {tab === 'invoicing' && (
        <SectionForm section="invoicing" initial={settings.invoicing} title="Invoicing"
          lead="Defaults for new invoices. You can still change any invoice individually.">
          {(v, set) => (
            <>
              <Field label="Payment due (days after invoice date)" type="number" inputMode="numeric" min="0"
                value={v.paymentTermsDays} onChange={set('paymentTermsDays')} />
              <div className="grid-2">
                <Field label="Invoice number prefix" value={v.numberPrefix} onChange={set('numberPrefix')} />
                <Field label="Next invoice number" type="number" inputMode="numeric" min="1"
                  value={v.nextNumber} onChange={set('nextNumber')} />
              </div>
              <Field label="VAT note" value={v.vatNote} onChange={set('vatNote')}
                hint="You're not VAT registered, so no VAT is added. This line explains that on invoices." />
            </>
          )}
        </SectionForm>
      )}

      {tab === 'pricing' && <PricingTab settings={settings} reload={reload} />}
      {tab === 'form' && <FormTab settings={settings} reload={reload} />}
      {tab === 'phone' && <PhoneTab />}
      {tab === 'email' && <EmailTab settings={settings} reload={reload} />}
      {tab === 'data' && <DataTab settings={settings} reload={reload} />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'security' && <SecurityTab />}
    </>
  );
}
