import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, PoundSterling, ChevronRight, Users } from 'lucide-react';
import { api } from '../api.js';
import { money, moneyShort, relativeDay } from '../format.js';

export const INVOICE_STATE = {
  draft: { label: 'Draft', tone: 'muted' },
  sent: { label: 'Sent', tone: 'gold' },
  viewed: { label: 'Viewed', tone: 'violet' },
  overdue: { label: 'Overdue', tone: 'red' },
  paid: { label: 'Paid', tone: 'green' },
};

const TABS = [
  { id: 'unpaid', label: 'Unpaid', match: (i) => ['sent', 'viewed', 'overdue'].includes(i.state) },
  { id: 'draft', label: 'Drafts', match: (i) => i.state === 'draft' },
  { id: 'paid', label: 'Paid', match: (i) => i.state === 'paid' },
  { id: 'all', label: 'All', match: () => true },
];

export default function Invoices() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'unpaid';
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

  useEffect(() => { api('/invoices').then(setList).catch((e) => setError(e.message)); }, []);

  if (!list) return error ? <div className="msg err">{error}</div> : null;
  const unpaid = list.filter(TABS[0].match);
  const owed = unpaid.reduce((a, i) => a + i.total_pence, 0);
  const overdue = unpaid.filter((i) => i.state === 'overdue').reduce((a, i) => a + i.total_pence, 0);
  const shown = list.filter(TABS.find((t) => t.id === tab).match);

  return (
    <>
      <div className="page-head">
        <h1>Invoices</h1>
        <Link className="btn small primary" to="/invoices/new"><Plus size={16} /> New</Link>
      </div>

      <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat"><div className="stat-label">Owed to you</div><div className="stat-value">{moneyShort(owed)}</div></div>
        <div className="stat"><div className="stat-label">Overdue</div><div className={`stat-value${overdue ? ' red' : ''}`}>{moneyShort(overdue)}</div></div>
      </div>
      <Link to="/invoices/money" className="alert" style={{ marginTop: 10 }}>
        <div className="alert-icon green"><PoundSterling size={20} /></div>
        <div className="row-main"><div className="row-title">Money &amp; tax year</div><div className="row-sub">Income by month and tax year, who owes what, export</div></div>
        <ChevronRight size={18} color="var(--faint)" />
      </Link>

      <Link to="/clients" className="alert" style={{ marginTop: 8 }}>
        <div className="alert-icon pink"><Users size={20} /></div>
        <div className="row-main"><div className="row-title">Clients</div><div className="row-sub">Profiles for everyone you've worked for. Tap one to invoice them again.</div></div>
        <ChevronRight size={18} color="var(--faint)" />
      </Link>

      <div className="settings-nav" style={{ marginTop: 18 }}>
        {TABS.map((t) => {
          const n = list.filter(t.match).length;
          return <button key={t.id} className={`chip${tab === t.id ? ' active' : ''}`} onClick={() => setParams({ tab: t.id }, { replace: true })}>{t.label}{n && t.id !== 'all' ? ` · ${n}` : ''}</button>;
        })}
      </div>
      <div className="list">
        {shown.length ? shown.map((i) => {
          const s = INVOICE_STATE[i.state];
          return (
            <Link key={i.id} to={`/invoices/${i.id}`} className="row">
              <div className="row-main">
                <div className="row-title">{i.client_name}</div>
                <div className="row-sub">{i.number} · {i.state === 'paid' ? `paid ${relativeDay(i.paid_at.slice(0, 10), today).toLowerCase()}` : i.state === 'draft' ? 'not sent yet' : `due ${relativeDay(i.due_date, today).toLowerCase()}`}</div>
              </div>
              <div className="row-end">
                <div className="row-amount">{money(i.total_pence)}</div>
                <span className={`pill ${s.tone}`}>{s.label}</span>
              </div>
            </Link>
          );
        }) : <div className="empty">{tab === 'unpaid' ? "Nothing owed. Everyone's paid up." : 'Nothing here.'}</div>}
      </div>
    </>
  );
}
