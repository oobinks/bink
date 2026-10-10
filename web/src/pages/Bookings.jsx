import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Share2, List, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import { moneyShort, shortDate, timeAgo, dateParts } from '../format.js';
import { shareOrCopy } from '../share.js';

export const STATUS_INFO = {
  new: { label: 'New', tone: 'pink' },
  quoted: { label: 'Quoted', tone: 'gold' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  completed: { label: 'Completed', tone: 'violet' },
  declined: { label: 'Declined', tone: 'muted' },
};
const TABS = Object.keys(STATUS_INFO);

export async function shareBookingForm(setMsg) {
  const result = await shareOrCopy({
    title: 'Booking enquiry',
    text: 'Fill in this quick form and I\'ll get back to you within 24 to 48 hours:',
    url: `${window.location.origin}/book`,
  });
  if (result === 'copied') setMsg?.('Booking form link copied');
}

function BookingRow({ b, today }) {
  const { day, month } = dateParts(b.event_date);
  const amount = b.total_pence || b.budget_pence;
  return (
    <Link to={`/bookings/${b.id}`} className="row">
      <div className={`date-chip${b.event_date === today ? ' today' : ''}`}><b>{day}</b><small>{month}</small></div>
      <div className="row-main">
        <div className="row-title">{!b.seen_at && <span className="dot pink inline" />}{b.client_name}</div>
        <div className="row-sub">{[b.event_type, b.venue_name].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="row-end">
        <div className="row-amount">{amount ? moneyShort(amount) : ''}</div>
        <div className="row-sub">{b.status === 'new' ? timeAgo(b.created_at) : b.total_pence ? '' : amount ? 'budget' : ''}</div>
      </div>
    </Link>
  );
}

function MonthView({ today }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [items, setItems] = useState([]);
  const [picked, setPicked] = useState(null);
  useEffect(() => { api(`/bookings/calendar?month=${month}`).then(setItems).catch(() => setItems([])); }, [month]);

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  }, [month]);
  const byDay = useMemo(() => items.reduce((acc, b) => ((acc[b.event_date] ||= []).push(b), acc), {}), [items]);
  const move = (n) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
    setPicked(null);
  };
  const title = new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const shown = picked ? byDay[picked] || [] : items;

  return (
    <>
      <div className="card cal">
        <div className="cal-head">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={20} /></button>
          <b>{title}</b>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={20} /></button>
        </div>
        <div className="cal-grid">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
          {days.map((d, i) => d ? (
            <button key={d} className={`cal-day${d === today ? ' today' : ''}${d === picked ? ' picked' : ''}`}
              onClick={() => setPicked(d === picked ? null : d)}>
              {Number(d.slice(8))}
              <span className="cal-dots">
                {(byDay[d] || []).slice(0, 3).map((b) => <i key={b.id} className={`cal-dot ${STATUS_INFO[b.status].tone}`} />)}
              </span>
              {(byDay[d] || []).filter((b) => b.status === 'confirmed').length > 1 && <span className="cal-clash">!</span>}
            </button>
          ) : <div key={`x${i}`} />)}
        </div>
        <div className="cal-legend">
          {['confirmed', 'quoted', 'new'].map((s) => <span key={s}><i className={`cal-dot ${STATUS_INFO[s].tone}`} />{STATUS_INFO[s].label}</span>)}
        </div>
      </div>
      <div className="section">
        <div className="section-head"><h2>{picked ? shortDate(picked) : 'This month'}</h2></div>
        <div className="list">
          {shown.length ? shown.map((b) => <BookingRow key={b.id} b={b} today={today} />) : <div className="empty">Nothing booked.</div>}
        </div>
      </div>
    </>
  );
}

export default function Bookings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'new';
  const view = params.get('view') || 'list';
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

  useEffect(() => {
    if (view === 'list') api(`/bookings?status=${tab}`).then(setData).catch((e) => setMsg(e.message));
  }, [tab, view]);

  const go = (next) => setParams({ ...Object.fromEntries(params), ...next }, { replace: true });

  return (
    <>
      <div className="page-head">
        <h1>Bookings</h1>
        <div className="btn-row">
          <button className="btn small" onClick={() => shareBookingForm(setMsg)}><Share2 size={16} /> Form</button>
          <Link className="btn small primary" to="/bookings/new"><Plus size={16} /> Add</Link>
        </div>
      </div>
      {msg && <div className="msg ok" style={{ marginTop: -10, marginBottom: 12 }}>{msg}</div>}

      <div className="segmented">
        <button className={view === 'list' ? 'active' : ''} onClick={() => go({ view: 'list' })}><List size={16} /> Pipeline</button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => go({ view: 'calendar' })}><CalendarDays size={16} /> Calendar</button>
      </div>

      {view === 'calendar' ? <MonthView today={today} /> : (
        <>
          <div className="settings-nav">
            {TABS.map((t) => (
              <button key={t} className={`chip${tab === t ? ' active' : ''}`} onClick={() => go({ tab: t })}>
                {STATUS_INFO[t].label}{data?.counts[t] ? ` · ${data.counts[t]}` : ''}
              </button>
            ))}
          </div>
          <div className="list">
            {data?.bookings.length ? data.bookings.map((b) => <BookingRow key={b.id} b={b} today={today} />)
              : data && <div className="empty">Nothing here.</div>}
          </div>
        </>
      )}
    </>
  );
}
