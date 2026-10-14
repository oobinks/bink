// Ask (/ask): questions about your bookings, invoices and clients, answered in plain English.
// Any change it suggests shows as a button; nothing changes until you tap it.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Send, Check, ExternalLink, Trash2 } from 'lucide-react';
import { api } from '../api.js';

const EXAMPLES = ['Who still owes me money?', 'Why was a quote closed?', "What's booked in November?", 'Which invoices are overdue?'];
const KEY = 'djhq-ask';

function load() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch { return []; }
}

export default function Ask() {
  const [messages, setMessages] = useState(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef();

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-30))); } catch { /* private mode */ }
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy) return;
    setText('');
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMessages((ms) => [...ms, { role: 'user', content: q }]);
    setBusy(true);
    try {
      const r = await api('/ask', { method: 'POST', body: { question: q, history } });
      setMessages((ms) => [...ms, { role: 'assistant', content: r.answer, actions: r.actions }]);
    } catch (err) {
      setMessages((ms) => [...ms, { role: 'assistant', content: err.message, error: true }]);
    }
    setBusy(false);
  };

  // Tapping a suggested change: it runs through the normal app (so it's logged in Change history).
  const doAction = async (i, j) => {
    const a = messages[i].actions[j];
    setMessages((ms) => ms.map((m, k) => (k === i ? { ...m, actions: m.actions.map((x, l) => (l === j ? { ...x, state: 'busy' } : x)) } : m)));
    let state = 'done';
    let note = 'Done ✓';
    try {
      await api(a.path, { method: a.method, body: a.body });
    } catch (err) {
      state = 'failed';
      note = err.message;
    }
    setMessages((ms) => ms.map((m, k) => (k === i ? { ...m, actions: m.actions.map((x, l) => (l === j ? { ...x, state, note } : x)) } : m)));
  };

  return (
    <div className="chat ask">
      <div className="chat-head">
        <Link to="/more" className="icon-btn" aria-label="Back"><ChevronLeft size={20} /></Link>
        <div className="row-main"><div className="row-title" style={{ fontSize: 22 }}>Ask</div>
          <div className="row-sub">Questions about your bookings, invoices and clients</div></div>
        {messages.length > 0 && <button className="icon-btn" aria-label="Clear chat" onClick={() => setMessages([])}><Trash2 size={18} /></button>}
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <>
            <div className="bubble claude">Hi! Ask me anything about your gigs, quotes, invoices or clients. If you want something changed, I'll give you a button to confirm it first.</div>
            <div className="epk-chips">{EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => ask(e)}>{e}</button>)}</div>
          </>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'you' : 'claude'}${m.error ? ' err' : ''}`}>
            <div className="ask-text">{m.content}</div>
            {m.actions?.length > 0 && (
              <div className="ask-actions">
                {m.actions.map((a, j) => (a.kind === 'open' ? (
                  <Link key={j} className="btn small" to={a.link}><ExternalLink size={14} /> {a.label}</Link>
                ) : a.state === 'done' ? (
                  <Link key={j} className="btn small done" to={a.link}><Check size={14} /> {a.note} {a.label}</Link>
                ) : (
                  <button key={j} className="btn small primary" disabled={a.state === 'busy'} onClick={() => doAction(i, j)}>
                    <Check size={14} /> {a.state === 'busy' ? 'Doing it…' : a.label}
                  </button>
                )))}
                {m.actions.some((a) => a.state === 'failed') && <div className="msg err">{m.actions.find((a) => a.state === 'failed').note}</div>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble claude typing"><span /><span /><span /></div>}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <textarea className="input" rows={1} value={text} placeholder="Ask a question" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }} />
        <button className="btn primary" disabled={busy || !text.trim()} aria-label="Send"><Send size={18} /></button>
      </form>
      <p className="hint" style={{ margin: 0 }}>Answers come from your own data and can occasionally be wrong. Check before acting on money matters.</p>
    </div>
  );
}
