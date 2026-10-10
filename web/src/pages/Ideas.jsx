import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import { timeAgo } from '../format.js';

export const STATUS = {
  chatting: { label: 'Chatting', tone: 'muted' },
  building: { label: 'Building…', tone: 'violet' },
  ready: { label: 'Preview ready', tone: 'gold' },
  live: { label: 'Live', tone: 'green' },
  failed: { label: 'Needs another go', tone: 'red' },
  undone: { label: 'Undone', tone: 'muted' },
};

export function NotConnected() {
  return (
    <div className="card">
      <h3>Not connected yet</h3>
      <p className="lead">
        This needs a one-time setup so the app can talk to Claude. Follow "Improve the app setup" in the README,
        or ask Claude in the main chat to walk you through it.
      </p>
    </div>
  );
}

export default function Ideas() {
  const [ideas, setIdeas] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { api('/ideas').then(setIdeas).catch((e) => setError(e.message)); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { number } = await api('/ideas', { method: 'POST', body: { text } });
      navigate(`/ideas/${number}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head"><h1>Improve the app</h1></div>
      {error === 'not-connected' ? <NotConnected /> : (
        <>
          <form className="card" onSubmit={submit}>
            <h3>What would you change?</h3>
            <p className="lead">Describe it in your own words. Claude will reply in a minute or two and talk it through with you.</p>
            <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Show the venue's postcode on the gig list" />
            <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !text.trim()}>
              <Sparkles size={18} /> {busy ? 'Sending…' : 'Start chat'}
            </button>
            {error && <div className="msg err">{error}</div>}
          </form>

          {ideas?.length > 0 && (
            <div className="section">
              <div className="section-head"><h2>Your ideas</h2></div>
              <div className="list">
                {ideas.map((i) => (
                  <Link key={i.number} to={`/ideas/${i.number}`} className="row">
                    <div className="row-main">
                      <div className="row-title">{i.title}</div>
                      <div className="row-sub">{timeAgo(i.updatedAt)}</div>
                    </div>
                    <span className={`pill ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
                    <ChevronRight size={18} color="var(--faint)" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
