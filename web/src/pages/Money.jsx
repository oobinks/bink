import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { api } from '../api.js';
import { money, moneyShort } from '../format.js';
import { INVOICE_STATE } from './Invoices.jsx';

const monthName = (m) => new Date(m + '-15').toLocaleDateString('en-GB', { month: 'short' });

export default function Money() {
  const [r, setR] = useState(null);
  useEffect(() => { api('/invoices/report').then(setR); }, []);
  if (!r) return null;
  const max = Math.max(...r.months.map((m) => m.pence), 1);
  const thisYear = r.taxYears.find((t) => t.year === r.currentTaxYear)?.pence || 0;
  const last12 = r.months.reduce((a, m) => a + m.pence, 0);

  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to="/invoices" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
        <h1 style={{ fontSize: 24 }}>Money</h1>
      </div>

      <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat"><div className="stat-label">Tax year {r.currentTaxYear.replace('-', '/')}</div><div className="stat-value">{moneyShort(thisYear)}</div></div>
        <div className="stat"><div className="stat-label">Last 12 months</div><div className="stat-value">{moneyShort(last12)}</div></div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Paid by month</h2></div>
        <div className="card">
          <div className="bars" role="img" aria-label="Income paid each month for the last 12 months">
            {r.months.map((m) => (
              <div className="bar-col" key={m.month} title={`${monthName(m.month)}: ${money(m.pence)}`}>
                <span className="bar-val">{m.pence ? moneyShort(m.pence).replace('£', '') : ''}</span>
                <div className="bar" style={{ height: `${Math.max(2, (m.pence / max) * 100)}%` }} />
                <span className="bar-label">{monthName(m.month)}</span>
              </div>
            ))}
          </div>
          <p className="hint" style={{ margin: '10px 0 0' }}>Counted on the day you marked each invoice paid. Amounts in £.</p>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>By tax year</h2></div>
        <div className="list">
          {r.taxYears.length ? r.taxYears.map((t) => (
            <div className="row" key={t.year}>
              <div className="row-main"><div className="row-title">{t.year.replace('-', '/')}</div><div className="row-sub">6 April {t.year.slice(0, 4)} to 5 April 20{t.year.slice(5)}</div></div>
              <div className="row-amount">{money(t.pence)}</div>
            </div>
          )) : <div className="empty">Nothing paid yet.</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Who owes what</h2></div>
        <div className="list">
          {r.owed.length ? r.owed.map((o) => (
            <div className="row" key={o.client}>
              <div className="row-main">
                <div className="row-title">{o.client}</div>
                <div className="row-sub">
                  {o.invoices.map((i, n) => (
                    <span key={i.id}>{n > 0 && ', '}<Link to={`/invoices/${i.id}`} style={{ color: `var(--${INVOICE_STATE[i.state].tone === 'red' ? 'red' : 'gold'})` }}>{i.number}</Link></span>
                  ))}
                </div>
              </div>
              <div className="row-end">
                <div className="row-amount">{money(o.pence)}</div>
                {o.overduePence > 0 && <span className="pill red">{money(o.overduePence)} overdue</span>}
              </div>
            </div>
          )) : <div className="empty">Nobody owes you anything.</div>}
        </div>
      </div>

      <a className="btn block" style={{ marginTop: 20 }} href="/api/invoices/export.csv"><Download size={18} /> Download spreadsheet (CSV)</a>
      <p className="hint" style={{ textAlign: 'center' }}>Every invoice, with the tax year each was paid in. Handy for your Self Assessment.</p>
    </>
  );
}
