import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Disc3, Inbox, AlertTriangle, Clock, Receipt, Clapperboard, Sparkles, Share2, Plus } from 'lucide-react';
import { shareBookingForm } from './Bookings.jsx';
import { api } from '../api.js';
import { money, moneyShort, shortDate, relativeDay, dateParts, timeAgo } from '../format.js';

const ALERT_ICONS = { gig: Disc3, enquiry: Inbox, overdue: AlertTriangle, due: Clock, invoice: Receipt, clips: Clapperboard };

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late one, ctrinn?';
  if (h < 12) return 'Morning, ctrinn';
  if (h < 18) return 'Afternoon, ctrinn';
  return 'Evening, ctrinn';
}

function DateChip({ date, today }) {
  const { day, month } = dateParts(date);
  return <div className={`date-chip${date === today ? ' today' : ''}`}><b>{day}</b><small>{month}</small></div>;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sample, setSample] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const load = () => {
      api('/dashboard').then(setData).catch((e) => setError(e.message));
      api('/settings').then((s) => setSample(s.meta.hasSampleData)).catch(() => {});
    };
    load();
    // Refresh when you come back to the app.
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (error) return <div className="msg err">{error}</div>;
  if (!data) return null;
  const { today, stats, attention, upcomingGigs, newEnquiries, unpaid, clips } = data;
  const nextGig = upcomingGigs[0];

  return (
    <>
      {sample && (
        <div className="sample-banner">
          <Sparkles size={16} /> Showing sample data
          <Link to="/settings?tab=data">Remove it</Link>
        </div>
      )}

      <div className="hero">
        <div className="eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>{greeting()}</h1>
        <p>
          {nextGig
            ? <>Next up: <b style={{ color: 'var(--text)' }}>{nextGig.venue_name}</b> · {relativeDay(nextGig.event_date, today).toLowerCase()}</>
            : 'No gigs booked yet.'}
        </p>
      </div>

      <div className="quick">
        <button className="btn" onClick={() => shareBookingForm(setCopied)}><Share2 size={18} /> {copied ? 'Link copied' : 'Share booking form'}</button>
        <Link className="btn" to="/bookings/new"><Plus size={18} /> Add enquiry</Link>
      </div>

      <div className="section stats">
        <div className="stat"><div className="stat-label">Gigs next 30 days</div><div className="stat-value">{stats.gigsNext30}</div></div>
        <div className="stat"><div className="stat-label">Owed to you</div><div className="stat-value">{moneyShort(stats.owedPence)}</div></div>
        <div className="stat"><div className="stat-label">Overdue</div>
          <div className={`stat-value${stats.overduePence ? ' red' : ''}`}>{moneyShort(stats.overduePence)}</div></div>
        <div className="stat"><div className="stat-label">Paid this month</div><div className="stat-value">{moneyShort(stats.earnedThisMonthPence)}</div></div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Needs your attention</h2></div>
        {attention.length ? (
          <div className="attention">
            {attention.map((a, i) => {
              const Icon = ALERT_ICONS[a.kind] || Sparkles;
              return (
                <Link key={i} to={a.link} className="alert">
                  <div className={`alert-icon ${a.tone}`}><Icon size={20} /></div>
                  <div className="row-main">
                    <div className="row-title">{a.title}</div>
                    <div className="row-sub">{a.detail}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="card all-clear">All clear. Nothing needs you today. 🪩</div>
        )}
      </div>

      <div className="section">
        <div className="section-head"><h2>Upcoming gigs</h2><Link to="/bookings">Calendar</Link></div>
        <div className="list">
          {upcomingGigs.length ? upcomingGigs.map((g) => (
            <Link key={g.id} to={`/bookings/${g.id}`} className="row">
              <DateChip date={g.event_date} today={today} />
              <div className="row-main">
                <div className="row-title">{g.venue_name || g.client_name}</div>
                <div className="row-sub">{g.event_type} · {g.start_time}{g.end_time && `–${g.end_time}`}</div>
              </div>
              <div className="row-end"><div className="row-amount">{moneyShort(g.price_pence)}</div></div>
            </Link>
          )) : <div className="empty">No confirmed gigs coming up.</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>New enquiries</h2><Link to="/bookings">All</Link></div>
        <div className="list">
          {newEnquiries.length ? newEnquiries.map((e) => (
            <Link key={e.id} to={`/bookings/${e.id}`} className="row">
              {!e.seen_at && <span className="dot pink" />}
              <div className="row-main">
                <div className="row-title">{e.client_name}</div>
                <div className="row-sub">{e.event_type} · {shortDate(e.event_date)} · {e.venue_name}</div>
              </div>
              <div className="row-end">
                <div className="row-amount">{e.budget_pence ? moneyShort(e.budget_pence) : ''}</div>
                <div className="row-sub">{e.budget_pence ? 'budget · ' : ''}{timeAgo(e.created_at)}</div>
              </div>
            </Link>
          )) : <div className="empty">No new enquiries.</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Unpaid invoices</h2><Link to="/invoices">All</Link></div>
        <div className="list">
          {unpaid.length ? unpaid.map((i) => (
            <Link key={i.id} to={`/invoices/${i.id}`} className="row">
              <div className="row-main">
                <div className="row-title">{i.client_name}</div>
                <div className="row-sub">{i.number} · due {relativeDay(i.due_date, today).toLowerCase()}</div>
              </div>
              <div className="row-end">
                <div className="row-amount">{money(i.total_pence)}</div>
                {i.state === 'overdue' ? <span className="pill red">Overdue</span> : <span className="pill gold">Sent</span>}
              </div>
            </Link>
          )) : <div className="empty">Everyone's paid up. Nice.</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Clips</h2><Link to="/content">Content hub</Link></div>
        <Link to="/content" className="alert">
          <div className="alert-icon violet"><Clapperboard size={20} /></div>
          <div className="row-main">
            <div className="row-title">{clips.unscheduled} waiting to be scheduled</div>
            <div className="row-sub">{clips.scheduled} scheduled to post</div>
          </div>
        </Link>
      </div>
    </>
  );
}
