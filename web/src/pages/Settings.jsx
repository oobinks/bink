import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

const TABS = [
  { id: 'business', label: 'Your details' },
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

      {tab === 'data' && <DataTab settings={settings} reload={reload} />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'security' && <SecurityTab />}
    </>
  );
}
