// Analytics (/analytics): income, gigs, gig types, busiest days, enquiries and best clients.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Table2, BarChart3 } from 'lucide-react';
import { api } from '../api.js';
import { money, moneyShort } from '../format.js';

const PERIODS = [['12m', 'Last 12 months'], ['tax', 'Tax year'], ['all', 'All time']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const bucketShort = (key) => (key.length === 4 ? key : MONTHS[Number(key.slice(5)) - 1]);
const bucketLong = (key) => (key.length === 4 ? key : `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`);
const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);

// Rounds the top of the scale up to a clean number (1, 2, 2.5, 5 × 10^n).
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}
const compactMoney = (pence) => {
  const p = pence / 100;
  return p >= 1000 ? `£${(p / 1000).toFixed(p % 1000 ? 1 : 0)}K` : `£${p}`;
};

function Tile({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// Column chart: one series (optionally split into a solid "done" part and a pale "ahead" part).
// Tap or hover a column for its value; the table button shows every number.
function Columns({ title, sub, data, format, axisFormat = format, legend, describe }) {
  const [active, setActive] = useState(null);
  const [table, setTable] = useState(false);
  const top = niceMax(Math.max(...data.map((d) => d.value), 0));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const shown = active ?? (data[peak]?.value ? peak : null);
  const many = data.length > 12;

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div><h3>{title}</h3>{sub && <div className="row-sub">{sub}</div>}</div>
        <button className="icon-btn" onClick={() => setTable(!table)} aria-label={table ? 'Show chart' : 'Show as table'}>
          {table ? <BarChart3 size={18} /> : <Table2 size={18} />}
        </button>
      </div>
      {legend && !table && (
        <div className="chart-legend">{legend.map(([cls, label]) => <span key={label}><i className={`key ${cls}`} />{label}</span>)}</div>
      )}
      {table ? (
        <table className="chart-table">
          <tbody>{data.map((d) => <tr key={d.key}><td>{bucketLong(d.key)}</td><td>{describe ? describe(d) : format(d.value)}</td></tr>)}</tbody>
        </table>
      ) : (
        <>
          <div className="chart-readout" aria-live="polite">
            {shown !== null ? <><b>{describe ? describe(data[shown]) : format(data[shown].value)}</b> <span>{bucketLong(data[shown].key)}{active === null ? ' · best' : ''}</span></> : <span>Nothing yet</span>}
          </div>
          <div className="chart-plot">
            <div className="chart-grid">
              {[top, top / 2, 0].map((t) => <div key={t} className="grid-line"><span>{axisFormat(t)}</span></div>)}
            </div>
            <div className="chart-cols" onPointerLeave={() => setActive(null)}>
              {data.map((d, i) => {
                const ahead = d.ahead || 0;
                return (
                  <button key={d.key} className={`col${active === i ? ' on' : ''}`} onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)}
                    onClick={() => setActive(i)} aria-label={`${bucketLong(d.key)}: ${describe ? describe(d) : format(d.value)}`}>
                    <span className="bar-stack" style={{ height: `${(d.value / top) * 100}%` }}>
                      {ahead > 0 && <span className="bar ahead" style={{ flexGrow: ahead }} />}
                      {d.value - ahead > 0 && <span className="bar" style={{ flexGrow: d.value - ahead }} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="chart-x">
            {data.map((d, i) => <span key={d.key}>{!many || i % 2 === 0 ? bucketShort(d.key) : ''}</span>)}
          </div>
        </>
      )}
    </div>
  );
}

// Horizontal bars with the numbers written alongside (no hover needed).
function BarList({ rows }) {
  const top = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div key={r.name} className="barlist-row">
          <div className="barlist-text"><span>{r.name}</span><b>{r.label}</b></div>
          <div className="barlist-track"><span style={{ width: `${r.value ? Math.max(2, (r.value / top) * 100) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState('12m');
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`/analytics?period=${period}`).then((d) => { setA(d); setError(''); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [period]);

  if (!a) return error ? <div className="msg err">{error}</div> : null;
  const { funnel, repeatClients } = a;

  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to="/more" className="icon-btn" aria-label="Back"><ChevronLeft size={20} /></Link>
        <div className="row-main"><div className="row-title" style={{ fontSize: 22 }}>Analytics</div></div>
      </div>

      <div className="epk-chips" style={{ margin: '0 0 16px' }}>
        {PERIODS.map(([id, label]) => (
          <button key={id} className={`chip${period === id ? ' active' : ''}`} onClick={() => setPeriod(id)}>{label}</button>
        ))}
      </div>

      <div className={`analytics${loading ? ' loading' : ''}`}>
        <div className="card hero-figure">
          <div className="stat-label">Income · {a.label}</div>
          <div className="hero-value">{money(a.incomePence)}</div>
          <div className="row-sub">Paid invoices and deposits</div>
        </div>

        <div className="section stats">
          <Tile label="Gigs played" value={a.gigsPlayed} sub={a.gigsAhead ? `+${a.gigsAhead} booked ahead` : null} />
          <Tile label="Average fee" value={a.averageFeePence ? moneyShort(a.averageFeePence) : '—'} />
          <Tile label="Enquiries booked" value={funnel.enquiries ? `${pct(funnel.booked, funnel.enquiries)}%` : '—'}
            sub={`${funnel.booked} of ${funnel.enquiries}`} />
          <Tile label="Repeat clients" value={repeatClients.total ? `${pct(repeatClients.returning, repeatClients.total)}%` : '—'}
            sub={`${repeatClients.returning} of ${repeatClients.total} came back`} />
        </div>

        <div className="section">
          <Columns title="Income" sub={a.bucket === 'year' ? 'By year' : 'By month'} data={a.income} format={money} axisFormat={compactMoney} />
        </div>

        <div className="section">
          <Columns title="Gigs" sub={a.bucket === 'year' ? 'By year' : 'By month'} data={a.gigsByMonth}
            format={(n) => `${n} ${n === 1 ? 'gig' : 'gigs'}`} axisFormat={(n) => (Number.isInteger(n) ? n : '')}
            describe={(d) => `${d.value} ${d.value === 1 ? 'gig' : 'gigs'}${d.ahead ? ` (${d.ahead} still to come)` : ''}`}
            legend={a.gigsAhead ? [['', 'Played'], ['ahead', 'Booked ahead']] : null} />
        </div>

        <div className="section card">
          <h3>Gig types</h3>
          <p className="lead">What you earn from each kind of gig, booked and played.</p>
          {a.types.length
            ? <BarList rows={a.types.map((t) => ({ name: t.name, value: t.pence, label: `${moneyShort(t.pence)} · ${t.gigs} ${t.gigs === 1 ? 'gig' : 'gigs'}` }))} />
            : <div className="empty">No gigs in this period.</div>}
        </div>

        <div className="section card">
          <h3>Busiest days</h3>
          <BarList rows={a.days.map((d) => ({ name: d.name, value: d.gigs, label: d.gigs ? String(d.gigs) : '–' }))} />
        </div>

        <div className="section card">
          <h3>Enquiries</h3>
          <p className="lead">
            {funnel.enquiries ? `${a.fromForm} of ${funnel.enquiries} came through your booking form.` : 'No enquiries in this period.'}
            {a.leadDays !== null && ` People book about ${a.leadDays >= 14 ? `${Math.round(a.leadDays / 7)} weeks` : `${a.leadDays} days`} ahead.`}
          </p>
          <BarList rows={[
            { name: 'Enquiries', value: funnel.enquiries, label: String(funnel.enquiries) },
            { name: 'Quoted', value: funnel.quoted, label: `${funnel.quoted} · ${pct(funnel.quoted, funnel.enquiries)}%` },
            { name: 'Booked', value: funnel.booked, label: `${funnel.booked} · ${pct(funnel.booked, funnel.enquiries)}%` },
          ]} />
        </div>

        <div className="section">
          <div className="section-head"><h2>Best clients</h2><Link to="/clients">All clients</Link></div>
          <div className="list">
            {a.topClients.length ? a.topClients.map((c, i) => (
              <div key={c.name} className="row">
                <div className="rank">{i + 1}</div>
                <div className="row-main"><div className="row-title">{c.name}</div>
                  <div className="row-sub">{c.gigs} {c.gigs === 1 ? 'gig' : 'gigs'} in total</div></div>
                <div className="row-amount">{moneyShort(c.pence)}</div>
              </div>
            )) : <div className="empty">No payments in this period.</div>}
          </div>
        </div>

        <p className="hint" style={{ marginTop: 18 }}>{a.clipsPosted} {a.clipsPosted === 1 ? 'clip' : 'clips'} posted in this period.</p>
      </div>
    </>
  );
}
