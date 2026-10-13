// Trends (/trends): what's changing in the business, in plain English. Worked out fresh each time you open it.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Lightbulb, Minus } from 'lucide-react';
import { api } from '../api.js';

const TONES = {
  up: { icon: TrendingUp, cls: 'green', label: 'Going up' },
  down: { icon: TrendingDown, cls: 'red', label: 'Going down' },
  steady: { icon: Minus, cls: 'muted', label: 'Steady' },
  idea: { icon: Lightbulb, cls: 'gold', label: 'Idea' },
};

function Trend({ t }) {
  const { icon: Icon, cls, label } = TONES[t.tone] || TONES.steady;
  const body = (
    <>
      <div className={`alert-icon ${cls}`} aria-label={label}><Icon size={20} /></div>
      <div className="row-main">
        <div className="trend-title">{t.title}</div>
        <div className="trend-detail">{t.detail}</div>
      </div>
      {t.link && <ChevronRight size={18} color="var(--faint)" />}
    </>
  );
  return t.link ? <Link to={t.link} className="row trend">{body}</Link> : <div className="row trend">{body}</div>;
}

export default function Trends() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/trends').then(setData).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to="/more" className="icon-btn" aria-label="Back"><ChevronLeft size={20} /></Link>
        <div className="row-main"><div className="row-title" style={{ fontSize: 22 }}>Trends</div>
          <div className="row-sub">What's changing, from your own bookings and payments</div></div>
      </div>
      {error && <div className="msg err">{error}</div>}
      {data && (data.trends.length ? (
        <div className="list">{data.trends.map((t) => <Trend key={t.id} t={t} />)}</div>
      ) : (
        <div className="card empty">Not enough to go on yet. Trends appear as you add more gigs, invoices and clips.</div>
      ))}
      {data && <p className="hint" style={{ marginTop: 12 }}>Updated every time you open this page.</p>}
    </>
  );
}
