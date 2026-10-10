import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, Hammer, Rocket, Undo2, ExternalLink } from 'lucide-react';
import { api } from '../api.js';
import { STATUS, NotConnected } from './Ideas.jsx';

const ACTION_TEXT = { build: 'You tapped Build it', ship: 'You tapped Make it live', undo: 'You tapped Undo' };

// Light formatting for Claude's replies: **bold**, bullet lists, paragraphs.
function Rich({ text }) {
  const bold = (line) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part);
  const isBullet = (l) => /^\s*[-*•]\s/.test(l);
  const out = [];
  text.split(/\n{2,}/).forEach((block, i) => {
    // Group runs of bullet lines into lists, everything else into paragraphs.
    let run = [];
    let kind = null;
    const flush = (j) => {
      if (!run.length) return;
      out.push(kind === 'ul'
        ? <ul key={`${i}-${j}`}>{run.map((l, k) => <li key={k}>{bold(l.replace(/^\s*[-*•]\s/, ''))}</li>)}</ul>
        : <p key={`${i}-${j}`}>{run.map((l, k) => <span key={k}>{k > 0 && <br />}{bold(l.replace(/^#+\s*/, ''))}</span>)}</p>);
      run = [];
    };
    block.split('\n').forEach((line, j) => {
      const k = isBullet(line) ? 'ul' : 'p';
      if (k !== kind) { flush(j); kind = k; }
      run.push(line);
    });
    flush('end');
  });
  return out;
}

export default function IdeaChat() {
  const { n } = useParams();
  const [idea, setIdea] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);

  const load = () => api(`/ideas/${n}`).then((d) => { setIdea(d); setError(''); }).catch((e) => setError(e.message));

  useEffect(() => { load(); }, [n]);
  // While Claude is working, check for a reply every 8 seconds.
  useEffect(() => {
    if (!idea?.waiting && !(idea?.status === 'ready' && !idea.previewUrl)) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [idea?.waiting, idea?.status, idea?.previewUrl]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [idea?.messages.length, idea?.waiting]);

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api(`/ideas/${n}/messages`, { method: 'POST', body: { text } });
      setText('');
      await load();
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  };

  const act = async (action, question) => {
    if (question && !confirm(question)) return;
    setSending(true);
    try {
      await api(`/ideas/${n}/action`, { method: 'POST', body: { action } });
      await load();
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  };

  if (error === 'not-connected') return <NotConnected />;
  if (!idea) return error ? <div className="msg err">{error}</div> : null;
  const s = STATUS[idea.status];
  const busy = sending || idea.waiting;

  return (
    <div className="chat">
      <div className="chat-head">
        <Link to="/ideas" className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
        <div className="row-main">
          <div className="row-title">{idea.title}</div>
          <span className={`pill ${s.tone}`}>{s.label}</span>
        </div>
      </div>

      <div className="messages">
        {idea.messages.map((m, i) => m.action ? (
          <div key={i} className="note">{ACTION_TEXT[m.action]}</div>
        ) : (
          <div key={i} className={`bubble ${m.from}`}>
            {m.from === 'claude' ? <Rich text={m.text} /> : m.text}
          </div>
        ))}
        {idea.waiting && (
          <div className="bubble claude typing">
            <span /><span /><span />
            <small>{idea.status === 'building' ? 'Building your change. This takes a few minutes.' : 'Claude is replying. This takes a minute or two.'}</small>
          </div>
        )}
        {idea.status === 'ready' && (
          idea.previewUrl
            ? <a className="btn block" href={idea.previewUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Open the preview</a>
            : <div className="note">The preview link will appear here in a couple of minutes.</div>
        )}
        <div ref={bottom} />
      </div>

      <div className="chat-actions">
        {idea.status === 'ready' && (
          <button className="btn primary" disabled={busy} onClick={() => act('ship', 'Make this change live for real?')}>
            <Rocket size={18} /> Make it live
          </button>
        )}
        {idea.status === 'live' && (
          <button className="btn danger" disabled={busy} onClick={() => act('undo', 'Undo this change?')}><Undo2 size={18} /> Undo</button>
        )}
        {idea.status !== 'building' && (
          <button className={`btn${idea.status === 'ready' ? '' : ' primary'}`} disabled={busy || idea.messages.length < 2}
            onClick={() => act('build', idea.status === 'ready' ? 'Rebuild with the latest messages?' : null)}>
            <Hammer size={18} /> {idea.status === 'ready' ? 'Rebuild' : 'Build it'}
          </button>
        )}
      </div>

      <form className="composer" onSubmit={send}>
        <textarea className="input" rows={1} value={text} placeholder={busy ? 'Waiting for Claude…' : 'Message Claude'}
          onChange={(e) => setText(e.target.value)} disabled={busy} />
        <button className="btn primary" disabled={busy || !text.trim()} aria-label="Send"><Send size={18} /></button>
      </form>
      {error && <div className="msg err">{error}</div>}
    </div>
  );
}
