// Press pack editor (/press): switch the public page on, pick photos and clips, write the bio and rider.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Plus, X, ChevronLeft, ChevronRight, Copy, Share2, ExternalLink, Clapperboard, Image as ImageIcon } from 'lucide-react';
import { api } from '../api.js';
import { shareOrCopy } from '../share.js';
import { uploadClip, keepAwake } from '../clipUpload.js';

const fileUrl = (id) => `/api/clips/${id}/file`;
const isImage = (c) => c.content_type?.startsWith('image/');

function Tile({ clip, children, onClick }) {
  return (
    <div className="press-tile" onClick={onClick}>
      {isImage(clip)
        ? <img src={fileUrl(clip.id)} alt="" loading="lazy" />
        : <video src={`${fileUrl(clip.id)}#t=0.1`} preload="metadata" muted playsInline />}
      <span className="press-kind">{isImage(clip) ? <ImageIcon size={12} /> : <Clapperboard size={12} />}</span>
      {children}
    </div>
  );
}

function MediaPicker() {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [uploads, setUploads] = useState(null);
  const [error, setError] = useState('');
  const input = useRef();
  const load = () => api('/clips/press').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  if (!data) return error ? <div className="msg err">{error}</div> : null;
  const { items, others } = data;

  const move = async (i, dir) => {
    const ids = items.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setData((d) => ({ ...d, items: ids.map((id) => d.items.find((c) => c.id === id)) }));
    await api('/clips/press/order', { method: 'POST', body: { ids } }).catch((e) => setError(e.message));
  };
  const toggle = async (clip, on) => {
    await api(`/clips/${clip.id}`, { method: 'PATCH', body: { in_press: on } }).catch((e) => setError(e.message));
    load();
  };
  const pick = async (e) => {
    const files = [...e.target.files].filter((f) => /^(video|image)\//.test(f.type));
    e.target.value = '';
    if (!files.length) return;
    setError('');
    const lock = await keepAwake();
    for (let i = 0; i < files.length; i++) {
      setUploads({ n: i + 1, of: files.length, progress: 0 });
      try {
        await uploadClip(files[i], null, (progress) => setUploads({ n: i + 1, of: files.length, progress }), { press: true });
      } catch (err) {
        setError(`${files[i].name}: ${err.message}`);
        break;
      }
    }
    lock?.release?.().catch?.(() => {});
    setUploads(null);
    load();
  };

  return (
    <div className="section">
      <div className="section-head"><h2>Photos and clips</h2><span className="row-sub">{items.length} on your press pack</span></div>
      {items.length ? (
        <div className="press-grid">
          {items.map((c, i) => (
            <Tile key={c.id} clip={c}>
              <div className="press-tools">
                <button aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}><ChevronLeft size={16} /></button>
                <button aria-label="Remove from press pack" onClick={() => toggle(c, false)}><X size={16} /></button>
                <button aria-label="Move later" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ChevronRight size={16} /></button>
              </div>
            </Tile>
          ))}
        </div>
      ) : <div className="card empty">Nothing yet. Upload your best press photos, or add clips from your gigs.</div>}
      <p className="hint" style={{ marginTop: 8 }}>The first photo is the big picture at the top. Use the arrows to reorder.</p>

      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={pick} />
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn primary" style={{ flex: 1 }} disabled={!!uploads} onClick={() => input.current.click()}>
          <Upload size={18} /> {uploads ? `Uploading ${uploads.n} of ${uploads.of}… ${Math.round(uploads.progress * 100)}%` : 'Upload photos'}
        </button>
        {others.length > 0 && <button className="btn" onClick={() => setAdding(!adding)}><Plus size={18} /> {adding ? 'Done' : 'From your clips'}</button>}
      </div>
      {error && <div className="msg err">{error}</div>}
      {adding && (
        <>
          <p className="hint" style={{ marginTop: 12 }}>Tap to add to your press pack.</p>
          <div className="press-grid">
            {others.map((c) => <Tile key={c.id} clip={c} onClick={() => toggle(c, true)}><span className="press-add"><Plus size={18} /></span></Tile>)}
          </div>
        </>
      )}
    </div>
  );
}

function Details({ initial, venues }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }));
  const played = v.playedAt.map((x) => x.trim().toLowerCase());
  const suggestions = venues.filter((x) => !played.includes(x.toLowerCase())).slice(0, 12);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { live, ...details } = v; // the on/off switch is saved separately, at the top
      setV(await api('/settings/press', { method: 'PUT', body: details }));
      setMsg({ ok: true, text: 'Saved. Your press pack is updated.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy(false);
  };
  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`press-${k}`}>{label}</label>
      <input id={`press-${k}`} className="input" value={v[k]} onChange={set(k)} {...props} />
    </div>
  );

  return (
    <form className="card section" onSubmit={save}>
      <h3>Your details</h3>
      <p className="lead">Your name, genres, location and email come from Settings → Your details.</p>
      {field('tagline', 'Tagline', { placeholder: 'House and disco DJ from Essex' })}
      <div className="field">
        <label htmlFor="press-bio">Bio</label>
        <textarea id="press-bio" className="input" rows={7} value={v.bio} onChange={set('bio')}
          placeholder="A few lines about you: your sound, the crowds you play for, residencies, highlights." />
      </div>
      <div className="field">
        <label htmlFor="press-played">Played at (one per line)</label>
        <textarea id="press-played" className="input" rows={4} value={v.playedAt.join('\n')}
          onChange={(e) => setV((o) => ({ ...o, playedAt: e.target.value.split('\n') }))} />
        {suggestions.length > 0 && (
          <div className="epk-chips">
            {suggestions.map((x) => (
              <button type="button" key={x} className="chip" onClick={() => setV((o) => ({ ...o, playedAt: [...o.playedAt.filter((y) => y.trim()), x] }))}>+ {x}</button>
            ))}
          </div>
        )}
        <span className="hint">Suggestions come from your gigs. Only add venues you're happy to show publicly.</span>
      </div>
      <div className="grid-2">
        {field('instagram', 'Instagram', { placeholder: '@ctrinn' })}
        {field('tiktok', 'TikTok', { placeholder: '@ctrinn' })}
        {field('soundcloud', 'SoundCloud')}
        {field('mixcloud', 'Mixcloud')}
      </div>
      {field('youtube', 'YouTube')}
      <div className="field">
        <label htmlFor="press-rider">Tech rider</label>
        <textarea id="press-rider" className="input" rows={4} value={v.rider} onChange={set('rider')}
          placeholder="e.g. 2x CDJ-3000, DJM-900NXS2, 2 booth monitors, a table at hip height." />
      </div>
      <div className="row-head">
        <h3>Show my phone number</h3>
        <label className="switch"><input type="checkbox" checked={v.showPhone} onChange={(e) => setV((o) => ({ ...o, showPhone: e.target.checked }))} /> {v.showPhone ? 'On' : 'Off'}</label>
      </div>
      <p className="lead">Your email is always shown so promoters can book you.</p>
      <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </form>
  );
}

export default function Press() {
  const [press, setPress] = useState(null);
  const [venues, setVenues] = useState([]);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const link = `${window.location.origin}/epk`;

  useEffect(() => {
    api('/settings').then((s) => setPress(s.press)).catch((e) => setError(e.message));
    api('/clips/press').then((d) => setVenues(d.venues)).catch(() => {});
  }, []);
  if (!press) return error ? <div className="msg err">{error}</div> : null;

  const setLive = async (live) => {
    try {
      setPress(await api('/settings/press', { method: 'PUT', body: { live } }));
    } catch (err) {
      setError(err.message);
    }
  };
  const share = async () => {
    const r = await shareOrCopy({ title: 'Press pack', text: 'My press pack: photos, clips, bio and rider', url: link });
    if (r === 'copied') { setCopied('Link copied'); setTimeout(() => setCopied(''), 2000); }
  };

  return (
    <>
      <div className="chat-head" style={{ marginBottom: 14 }}>
        <Link to="/more" className="icon-btn" aria-label="Back"><ChevronLeft size={20} /></Link>
        <div className="row-main"><div className="row-title" style={{ fontSize: 22 }}>Press pack</div>
          <div className="row-sub">One link for promoters: photos, clips, bio and rider</div></div>
      </div>

      <div className="card">
        <div className="row-head">
          <h3>{press.live ? 'Your press pack is live' : 'Your press pack is off'}</h3>
          <label className="switch"><input type="checkbox" checked={press.live} onChange={(e) => setLive(e.target.checked)} /> {press.live ? 'On' : 'Off'}</label>
        </div>
        <p className="lead">{press.live ? 'Anyone with the link can see it and download your photos and clips.' : 'Switch it on when you are ready. Until then, the link shows nothing.'}</p>
        {press.live && (
          <>
            <button className="copy-row kv" onClick={() => navigator.clipboard.writeText(link).then(() => { setCopied('Copied'); setTimeout(() => setCopied(''), 2000); })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.replace(/^https?:\/\//, '')}</span>
              <span>{copied ? <span className="copied">{copied}</span> : <Copy size={15} />}</span>
            </button>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn primary" style={{ flex: 1 }} onClick={share}><Share2 size={18} /> Share link</button>
              <a className="btn" href="/epk" target="_blank" rel="noreferrer"><ExternalLink size={18} /> View</a>
            </div>
          </>
        )}
        {error && <div className="msg err">{error}</div>}
      </div>

      <MediaPicker />
      <Details initial={press} venues={venues} />
    </>
  );
}
