// Content hub: upload clips after a gig, star or bin them, captions, schedule, and share when the reminder comes.
import { useEffect, useRef, useState } from 'react';
import { Link, Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Upload, Star, Trash2, Clapperboard, CalendarClock, Check, Share2, Copy, Download, Sparkles, Image as ImageIcon, Undo2,
} from 'lucide-react';
import { api } from '../api.js';
import { shortDate } from '../format.js';
import { uploadClip, keepAwake } from '../clipUpload.js';

const fileUrl = (id) => `/api/clips/${id}/file`;
const isImage = (c) => c.content_type?.startsWith('image/');
const gigLabel = (c) => [c.venue_name || c.client_name, c.event_date && shortDate(c.event_date)].filter(Boolean).join(' · ') || 'No gig';
const fullCaption = (c) => [c.caption, c.hashtags].filter(Boolean).join('\n\n');

export function sizeLabel(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export function when(t) {
  if (!t) return '';
  const d = new Date(t.slice(0, 10) + 'T12:00:00Z');
  const [h, m] = t.slice(11, 16).split(':').map(Number);
  const time = `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${time}`;
}

function Thumb({ clip, big }) {
  const cls = big ? 'clip-media' : 'clip-thumb';
  if (!clip.has_file) return <div className={`${cls} empty-media`}>{isImage(clip) ? <ImageIcon size={big ? 40 : 20} /> : <Clapperboard size={big ? 40 : 20} />}</div>;
  if (isImage(clip)) return <img className={cls} src={fileUrl(clip.id)} alt="" loading="lazy" />;
  return big
    ? <video className={cls} src={fileUrl(clip.id)} controls playsInline loop autoPlay muted />
    : <video className={cls} src={`${fileUrl(clip.id)}#t=0.1`} preload="metadata" muted playsInline />;
}

function ClipRow({ clip, now }) {
  const due = clip.status === 'scheduled' && clip.scheduled_at <= now;
  return (
    <Link to={`/content/${clip.id}`} className="row">
      <Thumb clip={clip} />
      <div className="row-main">
        <div className="row-title">{clip.caption || clip.file_name}</div>
        <div className="row-sub">
          {clip.status === 'scheduled' ? when(clip.scheduled_at) : clip.status === 'posted' ? `Posted ${shortDate(clip.posted_at.slice(0, 10))}` : gigLabel(clip)}
        </div>
      </div>
      {due && <span className="pill pink">Post now</span>}
    </Link>
  );
}

function Back({ to = '/content', children }) {
  return (
    <div className="chat-head" style={{ marginBottom: 14 }}>
      <Link to={to} className="icon-btn" aria-label="Back"><ArrowLeft size={20} /></Link>
      <div className="row-main">{children}</div>
    </div>
  );
}

function Hub() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api('/clips').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  if (error) return <div className="msg err">{error}</div>;
  if (!data) return null;
  const { toReview, scheduled, starred, posted, storage, now } = data;
  const spread = async () => {
    const r = await api('/clips/spread', { method: 'POST' });
    setMsg(r.scheduled ? `${r.scheduled} scheduled, one a day from ${when(r.from)}.` : '');
    load();
  };
  const pct = Math.min(100, (storage.usedBytes / storage.freeBytes) * 100);

  return (
    <>
      <div className="page-head">
        <h1>Clips</h1>
        <Link className="btn primary small" to="/content/upload"><Upload size={16} /> Upload</Link>
      </div>

      {toReview.length > 0 && (
        <Link to="/content/review" className="alert" style={{ marginBottom: 18 }}>
          <div className="alert-icon violet"><Star size={20} /></div>
          <div className="row-main">
            <div className="row-title">{toReview.length} new {toReview.length === 1 ? 'clip' : 'clips'} to star or bin</div>
            <div className="row-sub">Keep the best, bin the rest</div>
          </div>
        </Link>
      )}

      <div className="section">
        <div className="section-head"><h2>Coming up</h2></div>
        <div className="list">
          {scheduled.length ? scheduled.map((c) => <ClipRow key={c.id} clip={c} now={now} />)
            : <div className="empty">Nothing scheduled. Star some clips, then schedule them.</div>}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Your phone buzzes at each time. Tap it, then Share to TikTok or Instagram. The caption is copied for you.</p>
      </div>

      <div className="section">
        <div className="section-head"><h2>Starred</h2></div>
        {starred.length > 0 && (
          <button className="btn block" style={{ marginBottom: 10 }} onClick={spread}>
            <CalendarClock size={18} /> Schedule all {starred.length}, one a day
          </button>
        )}
        {msg && <div className="msg ok" style={{ margin: '0 0 10px' }}>{msg}</div>}
        <div className="list">
          {starred.length ? starred.map((c) => <ClipRow key={c.id} clip={c} now={now} />) : <div className="empty">No starred clips waiting.</div>}
        </div>
      </div>

      {posted.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Posted</h2></div>
          <div className="list">{posted.map((c) => <ClipRow key={c.id} clip={c} now={now} />)}</div>
        </div>
      )}

      <div className="section">
        <div className="hint">Storage: {sizeLabel(storage.usedBytes)} of {sizeLabel(storage.freeBytes)} free space used</div>
        <div className="meter"><span style={{ width: `${pct}%` }} /></div>
      </div>
    </>
  );
}

function UploadClips() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [gigs, setGigs] = useState(null);
  const [gig, setGig] = useState(params.get('gig') || '');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const input = useRef();

  useEffect(() => {
    api('/clips/gigs').then((list) => {
      setGigs(list);
      setGig((g) => g || (list[0] ? String(list[0].id) : ''));
    }).catch(() => setGigs([]));
  }, []);

  const update = (i, patch) => setFiles((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const run = async (list) => {
    setBusy(true);
    const lock = await keepAwake();
    let ok = 0;
    for (const { file, i } of list) {
      update(i, { state: 'uploading', progress: 0, error: '' });
      try {
        await uploadClip(file, gig, (p) => update(i, { progress: p }));
        update(i, { state: 'done' });
        ok++;
      } catch (err) {
        update(i, { state: 'error', error: err.message });
        if (/storage is full/.test(err.message)) break;
      }
    }
    lock?.release?.().catch?.(() => {});
    if (ok) api('/clips/uploaded', { method: 'POST', body: { count: ok, booking_id: gig || null } }).catch(() => {});
    setBusy(false);
  };

  const pick = (e) => {
    const chosen = [...e.target.files].filter((f) => /^(video|image)\//.test(f.type));
    e.target.value = '';
    if (!chosen.length) return;
    const offset = files.length;
    setFiles((fs) => [...fs, ...chosen.map((file) => ({ file, state: 'waiting', progress: 0 }))]);
    run(chosen.map((file, k) => ({ file, i: offset + k })));
  };
  const retry = () => run(files.map((f, i) => ({ ...f, i })).filter((f) => f.state === 'error'));

  const done = files.filter((f) => f.state === 'done').length;
  const failed = files.filter((f) => f.state === 'error').length;

  return (
    <>
      <Back><div className="row-title" style={{ fontSize: 22 }}>Upload clips</div></Back>
      <div className="card">
        <div className="field">
          <label htmlFor="gig">Which gig?</label>
          <select id="gig" className="input" value={gig} disabled={busy} onChange={(e) => setGig(e.target.value)}>
            {gigs?.map((g) => <option key={g.id} value={g.id}>{g.venue_name || g.client_name} · {shortDate(g.event_date)}{g.clips ? ` (${g.clips} clips)` : ''}</option>)}
            <option value="">Not from a gig</option>
          </select>
        </div>
        <input ref={input} type="file" accept="video/*,image/*" multiple hidden onChange={pick} />
        <button className="btn primary block" disabled={busy} onClick={() => input.current.click()}>
          <Upload size={18} /> {files.length ? 'Add more' : 'Choose videos and photos'}
        </button>
        <p className="hint" style={{ margin: '8px 0 0' }}>Pick as many as you like. {busy ? 'Keep this screen open until it finishes.' : 'They upload straight away.'}</p>
      </div>

      {files.length > 0 && (
        <div className="list" style={{ marginTop: 14 }}>
          {files.map((f, i) => (
            <div key={i} className="row">
              <div className="row-main">
                <div className="row-title">{f.file.name}</div>
                <div className="row-sub">
                  {sizeLabel(f.file.size)} · {f.state === 'done' ? 'Uploaded' : f.state === 'error' ? f.error : f.state === 'uploading' ? `${Math.round(f.progress * 100)}%` : 'Waiting'}
                </div>
                {f.state === 'uploading' && <div className="meter"><span style={{ width: `${f.progress * 100}%` }} /></div>}
              </div>
              {f.state === 'done' && <span className="pill green"><Check size={12} /></span>}
              {f.state === 'error' && <span className="pill red">Failed</span>}
            </div>
          ))}
        </div>
      )}

      {!busy && failed > 0 && <button className="btn block" style={{ marginTop: 12 }} onClick={retry}>Try the failed ones again</button>}
      {!busy && done > 0 && (
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => navigate(`/content/review${gig ? `?gig=${gig}` : ''}`)}>
          <Star size={18} /> Star or bin them now
        </button>
      )}
    </>
  );
}

// Fast review: one clip at a time, Star or Bin. Binning waits a few seconds so you can undo.
function Review() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const gig = params.get('gig');
  const [list, setList] = useState(null);
  const [i, setI] = useState(0);
  const [starred, setStarred] = useState(0);
  const [undo, setUndo] = useState(null);
  const pending = useRef(null);

  useEffect(() => {
    api(`/clips${gig ? `?gig=${gig}` : ''}`).then((d) => setList(d.toReview)).catch(() => setList([]));
  }, [gig]);

  const flush = () => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    api(`/clips/${pending.current.id}`, { method: 'DELETE' }).catch(() => {});
    pending.current = null;
    setUndo(null);
  };
  useEffect(() => flush, []);

  if (!list) return null;
  const clip = list[i];

  const star = () => {
    flush();
    api(`/clips/${clip.id}`, { method: 'PATCH', body: { status: 'starred' } }).catch(() => {});
    setStarred((n) => n + 1);
    setI(i + 1);
  };
  const bin = () => {
    flush();
    const id = clip.id;
    pending.current = { id, index: i, timer: setTimeout(flush, 5000) };
    setUndo(id);
    setI(i + 1);
  };
  const undoBin = () => {
    clearTimeout(pending.current.timer);
    setI(pending.current.index);
    pending.current = null;
    setUndo(null);
  };
  const schedule = async () => {
    flush();
    await api('/clips/spread', { method: 'POST' });
    navigate('/content', { replace: true });
  };

  return (
    <>
      <Back><div className="row-title" style={{ fontSize: 22 }}>Star or bin</div>
        {clip && <div className="row-sub">{i + 1} of {list.length} · {gigLabel(clip)}</div>}</Back>
      {clip ? (
        <>
          <Thumb key={clip.id} clip={clip} big />
          <div className="review-actions">
            <button className="btn danger" onClick={bin}><Trash2 size={20} /> Bin</button>
            <button className="btn primary" onClick={star}><Star size={20} /> Star</button>
          </div>
        </>
      ) : (
        <div className="card done-card">
          <div className="done-icon"><Check size={28} /></div>
          <h3>All done</h3>
          <p className="lead">{starred ? `${starred} starred. Schedule them and your phone will remind you to post one a day.` : 'Nothing left to review.'}</p>
          {starred > 0 && <button className="btn primary block" onClick={schedule}><CalendarClock size={18} /> Schedule them, one a day</button>}
          <Link className="btn block" style={{ marginTop: 8 }} to="/content" onClick={flush}>Back to clips</Link>
        </div>
      )}
      {undo && <button className="btn block" style={{ marginTop: 12 }} onClick={undoBin}><Undo2 size={18} /> Undo bin</button>}
    </>
  );
}

const PREFETCH_MAX = 200 * 1e6;

function ClipDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clip, setClip] = useState(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [getting, setGetting] = useState(false);
  const [flash, setFlash] = useState('');
  const [askPosted, setAskPosted] = useState(false);
  const idea = useRef(1);

  const load = () => api(`/clips/${id}`).then((c) => setClip({ ...c, has_file: Boolean(c.has_file) })).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  // Phones only allow sharing straight after a tap, so the file is fetched first.
  const getFile = async (c = clip) => {
    setGetting(true);
    try {
      const blob = await fetch(fileUrl(c.id), { credentials: 'same-origin' }).then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      });
      setFile(new File([blob], c.file_name, { type: c.content_type || blob.type }));
    } catch {
      setError("Couldn't load the clip. Check your connection.");
    }
    setGetting(false);
  };
  useEffect(() => {
    if (clip?.has_file && !file && !getting && clip.size_bytes <= PREFETCH_MAX) getFile(clip);
  }, [clip?.id]);

  if (!clip) return error ? <div className="msg err">{error}</div> : null;

  const save = (body) => api(`/clips/${clip.id}`, { method: 'PATCH', body }).then(load).catch((e) => setError(e.message));
  const set = (k) => (e) => setClip((c) => ({ ...c, [k]: e.target.value }));
  const say = (t) => { setFlash(t); setTimeout(() => setFlash(''), 2500); };
  const copy = () => navigator.clipboard.writeText(fullCaption(clip)).then(() => say('Caption copied'), () => {});

  const share = async () => {
    copy(); // not awaited: the phone needs the share to start straight from the tap
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setAskPosted(true);
      } else if (clip.has_file) {
        window.location.href = `${fileUrl(clip.id)}?download=1`;
        say('Caption copied. Saving the clip to your phone…');
        setAskPosted(true);
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError("Couldn't open sharing. Try Save to phone instead.");
    }
  };
  const newIdea = async () => {
    const d = await api(`/clips/${clip.id}/caption?n=${idea.current++}`);
    setClip((c) => ({ ...c, caption: d.caption }));
    save({ caption: d.caption });
  };
  const posted = async () => {
    await save({ status: 'posted' });
    navigate('/content');
  };
  const remove = async () => {
    if (!confirm('Bin this clip? The file is deleted for good.')) return;
    await api(`/clips/${clip.id}`, { method: 'DELETE' });
    navigate('/content', { replace: true });
  };
  const statusPill = { new: ['violet', 'To review'], starred: ['gold', 'Starred'], scheduled: ['pink', 'Scheduled'], posted: ['green', 'Posted'] }[clip.status];

  return (
    <>
      <Back>
        <div className="row-title" style={{ fontSize: 20 }}>{gigLabel(clip)}</div>
        <div className="row-sub"><span className={`pill ${statusPill[0]}`}>{statusPill[1]}</span>{clip.status === 'scheduled' && ` ${when(clip.scheduled_at)}`}</div>
      </Back>

      <Thumb clip={clip} big />
      {!clip.has_file && <p className="hint">Sample clip: there's no video for this one.</p>}

      <div className="review-actions">
        {clip.has_file && clip.size_bytes > PREFETCH_MAX && !file
          ? <button className="btn primary" disabled={getting} onClick={() => getFile()}><Download size={18} /> {getting ? 'Getting it ready…' : `Get it ready (${sizeLabel(clip.size_bytes)})`}</button>
          : <button className="btn primary" disabled={clip.has_file && !file} onClick={clip.has_file ? share : copy}>
              {clip.has_file ? <><Share2 size={18} /> {file ? 'Share' : 'Getting it ready…'}</> : <><Copy size={18} /> Copy caption</>}
            </button>}
        <button className="btn" onClick={posted}><Check size={18} /> Posted</button>
      </div>
      {flash && <div className="msg ok">{flash}</div>}
      {askPosted && clip.status !== 'posted' && (
        <button className="btn block" style={{ marginTop: 10 }} onClick={posted}><Check size={18} /> Done, mark it as posted</button>
      )}
      <p className="hint" style={{ marginTop: 8 }}>Share copies the caption. In TikTok or Instagram, paste it in, then post.</p>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="caption">Caption</label>
          <textarea id="caption" className="input" rows={3} value={clip.caption || ''} onChange={set('caption')} onBlur={() => save({ caption: clip.caption })} />
        </div>
        <button className="btn small" onClick={newIdea}><Sparkles size={14} /> Another idea</button>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="hashtags">Hashtags</label>
          <input id="hashtags" className="input" value={clip.hashtags || ''} onChange={set('hashtags')} onBlur={() => save({ hashtags: clip.hashtags })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="when">Remind me to post it</label>
          <input id="when" className="input" type="datetime-local" step="3600" value={clip.scheduled_at || ''}
            onChange={(e) => save({ scheduled_at: e.target.value.slice(0, 16) || null })} />
          <span className="hint">Reminders go out on the hour.</span>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 14 }}>
        {clip.status === 'new' && <button className="btn" onClick={() => save({ status: 'starred' })}><Star size={16} /> Star</button>}
        {clip.has_file && <a className="btn" href={`${fileUrl(clip.id)}?download=1`}><Download size={16} /> Save to phone</a>}
        <button className="btn danger" onClick={remove}><Trash2 size={16} /> Bin</button>
      </div>
      {error && <div className="msg err">{error}</div>}
    </>
  );
}

export default function Content() {
  return (
    <Routes>
      <Route index element={<Hub />} />
      <Route path="upload" element={<UploadClips />} />
      <Route path="review" element={<Review />} />
      <Route path=":id" element={<ClipDetail />} />
    </Routes>
  );
}
