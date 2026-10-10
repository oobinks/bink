import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

const TABS = [
  { id: 'business', label: 'Your details' },
  { id: 'bank', label: 'Bank details' },
  { id: 'invoicing', label: 'Invoicing' },
  { id: 'data', label: 'Backups & export' },
  { id: 'security', label: 'Password' },
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

function Field({ label, hint, value, onChange, type = 'text', ...rest }) {
  const id = label.toLowerCase().replace(/\W+/g, '-');
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

function DataTab({ settings, reload }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const b = settings.backups;
  const [folder, setFolder] = useState(b.folder);
  const { save, msg: saveMsg, busy: saving } = useSave('backups', reload);

  const backupNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('/settings/backup-now', { method: 'POST' });
      setMsg({ ok: true, text: 'Backup saved' });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy(false);
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
          Every night at 3am the app saves a copy of everything. Point it at an iCloud Drive or Google Drive folder and
          the copies also end up safely off this laptop.
        </p>
        <div className="kv"><span>Saving to</span><span>{settings.meta.backupFolder}</span></div>
        <div className="kv"><span>Last backup</span><span>{b.lastBackupAt ? new Date(b.lastBackupAt).toLocaleString('en-GB') : 'Not yet'}</span></div>
        {b.lastBackupError && <div className="msg err">Last problem: {b.lastBackupError}</div>}

        <form onSubmit={(e) => { e.preventDefault(); save({ folder }); }} style={{ marginTop: 16 }}>
          {settings.meta.suggestedFolders.length > 0 && (
            <div className="field">
              <label>Found on this Mac — tap to use</label>
              <div className="btn-row">
                {settings.meta.suggestedFolders.map((f) => (
                  <button type="button" key={f.path} className="btn small" onClick={() => setFolder(f.path)}>{f.label}</button>
                ))}
              </div>
            </div>
          )}
          <Field label="Backup folder" value={folder} onChange={setFolder}
            hint="Leave empty to keep backups inside the app's own folder on this Mac." />
          <div className="btn-row">
            <button className="btn" disabled={saving}>Save folder</button>
            <button type="button" className="btn primary" onClick={backupNow} disabled={busy}>{busy ? 'Backing up…' : 'Back up now'}</button>
          </div>
          {saveMsg && <div className={`msg ${saveMsg.ok ? 'ok' : 'err'}`}>{saveMsg.text}</div>}
          {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        </form>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Export everything</h3>
        <p className="lead">One zip file with all your bookings, invoices and clips as spreadsheets, plus every photo and video.</p>
        <a className="btn block" href="/api/settings/export">Download export</a>
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

function PasswordTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/auth/change-password', { method: 'POST', body: { current, next } });
      setMsg({ ok: true, text: 'Password changed. Other devices have been logged out.' });
      setCurrent('');
      setNext('');
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3>Change password</h3>
      <p className="lead">Forgotten it? On your Mac, open Terminal in the app folder and run <code>npm run reset-password</code>.</p>
      <Field label="Current password" type="password" value={current} onChange={setCurrent} autoComplete="current-password" />
      <Field label="New password" type="password" value={next} onChange={setNext} autoComplete="new-password" hint="At least 8 characters" />
      <button className="btn primary block">Change password</button>
      {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </form>
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
          lead="Printed on your invoices so clients know where to pay. Stored only on your Mac.">
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

      {tab === 'data' && <DataTab settings={settings} reload={reload} />}
      {tab === 'security' && <PasswordTab />}
    </>
  );
}
