// The public press pack for promoters (/epk). No login: shows only what you've chosen in the app.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mail, Phone, Download, Camera, Music, Video, MapPin, Play, X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { zipFiles, saveBlob } from '../zip.js';

const mediaUrl = (m) => `/api/public/press/media/${m.id}`;

// Turn "@name" or "soundcloud.com/name" into a full link.
export function linkFor(kind, value) {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@+/, '');
  if (!v.includes('.')) {
    if (kind === 'instagram') return `https://instagram.com/${handle}`;
    if (kind === 'tiktok') return `https://www.tiktok.com/@${handle}`;
    if (kind === 'soundcloud') return `https://soundcloud.com/${handle}`;
    if (kind === 'mixcloud') return `https://www.mixcloud.com/${handle}`;
    if (kind === 'youtube') return `https://www.youtube.com/@${handle}`;
  }
  return `https://${v}`;
}

export const LINKS = [
  ['instagram', 'Instagram', Camera], ['tiktok', 'TikTok', Video], ['soundcloud', 'SoundCloud', Music],
  ['mixcloud', 'Mixcloud', Music], ['youtube', 'YouTube', Video],
];

const sizeLabel = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const totalSize = (list) => sizeLabel(list.reduce((a, m) => a + m.size, 0));

// Full-screen viewer: swipe (or arrow keys) left and right through the photos and clips.
function Viewer({ items, start, onClose, fileName }) {
  const track = useRef();
  const [i, setI] = useState(start);

  useLayoutEffect(() => {
    track.current.scrollLeft = start * track.current.clientWidth;
  }, []);
  useEffect(() => {
    // The phone's back button closes the viewer instead of leaving the page.
    history.pushState({ viewer: true }, '');
    const onPop = () => onClose();
    const onKey = (e) => {
      if (e.key === 'Escape') history.back();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);
  useEffect(() => {
    // Only the clip on screen plays.
    track.current.querySelectorAll('video').forEach((v) => { if (Number(v.dataset.i) !== i) v.pause(); });
  }, [i]);

  const go = (dir) => {
    const t = track.current;
    t.scrollTo({ left: Math.round(t.scrollLeft / t.clientWidth + dir) * t.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => setI(Math.round(track.current.scrollLeft / track.current.clientWidth));
  const m = items[i];

  return (
    <div className="viewer" role="dialog" aria-modal="true">
      <div className="viewer-bar">
        <button className="viewer-btn" onClick={() => history.back()} aria-label="Close"><X size={22} /></button>
        <span>{i + 1} / {items.length}</span>
        <a className="viewer-btn" href={`${mediaUrl(m)}?download=1`} download={fileName(m)} aria-label="Download this one"><Download size={20} /></a>
      </div>
      <div className="viewer-track" ref={track} onScroll={onScroll}>
        {items.map((x, k) => (
          <div key={x.id} className="viewer-slide">
            {Math.abs(k - i) > 1 ? null : x.kind === 'photo'
              ? <img src={mediaUrl(x)} alt="" />
              : <video data-i={k} src={mediaUrl(x)} controls playsInline preload="metadata" />}
          </div>
        ))}
      </div>
      {i > 0 && <button className="viewer-arrow left" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft size={28} /></button>}
      {i < items.length - 1 && <button className="viewer-arrow right" onClick={() => go(1)} aria-label="Next"><ChevronRight size={28} /></button>}
    </div>
  );
}

export default function PressPage() {
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [viewing, setViewing] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [zipping, setZipping] = useState(null);

  useEffect(() => {
    fetch('/api/public/press').then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setP(data);
      document.title = `${data.djName} · Press pack`;
    }).catch((e) => setError(e.message || "Can't load the press pack."));
  }, []);

  if (error) return <div className="public"><div className="card done-card"><p className="lead">{error}</p></div></div>;
  if (!p) return null;

  const slug = p.djName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const photos = p.media.filter((m) => m.kind === 'photo');
  const videos = p.media.filter((m) => m.kind === 'video');
  const shown = filter === 'photos' ? photos : filter === 'videos' ? videos : p.media;
  const cover = photos[0];
  // Friendly, numbered file names, e.g. ctrinn-photo-03.jpg (numbered by position on the page).
  const fileName = (m) => {
    const n = (m.kind === 'photo' ? photos : videos).indexOf(m) + 1;
    return `${slug}-${m.kind}-${String(n).padStart(2, '0')}${m.ext ? '.' + m.ext : ''}`;
  };
  const chosen = p.media.filter((m) => picked.has(m.id));

  const download = async (list, zipName) => {
    if (list.length === 1) {
      saveBlob(await fetch(mediaUrl(list[0])).then((r) => r.blob()), fileName(list[0]));
      return;
    }
    setZipping(0);
    try {
      const blob = await zipFiles(list.map((m) => ({ url: mediaUrl(m), size: m.size, name: fileName(m) })), setZipping);
      saveBlob(blob, zipName);
    } catch {
      alert("The download didn't finish. Please try again.");
    }
    setZipping(null);
  };
  const tap = (m, k) => {
    if (!selecting) return setViewing(k);
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
      return next;
    });
  };
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };
  const links = LINKS.filter(([k]) => p.links[k]);
  const zipLabel = zipping === null ? null : `Zipping… ${Math.round(zipping * 100)}%`;

  return (
    <div className={`public epk${selecting ? ' selecting' : ''}`}>
      <header className="epk-hero" style={cover ? { backgroundImage: `linear-gradient(180deg, rgba(11,10,16,0.15), var(--bg)), url(${mediaUrl(cover)})` } : undefined}>
        <div className="eyebrow">Press pack</div>
        <div className="wordmark"><span>{p.djName}</span></div>
        {p.tagline && <p className="epk-tagline">{p.tagline}</p>}
        {p.basedIn && <p className="row-sub"><MapPin size={13} /> {p.basedIn}</p>}
        {p.genres?.length > 0 && <div className="epk-chips">{p.genres.map((g) => <span key={g} className="pill gold">{g}</span>)}</div>}
      </header>

      {links.length > 0 && (
        <div className="epk-links">
          {links.map(([k, label, Icon]) => (
            <a key={k} className="epk-link" href={linkFor(k, p.links[k])} target="_blank" rel="noreferrer">
              <Icon size={18} /> {label}
            </a>
          ))}
        </div>
      )}

      <div className="btn-row">
        <a className="btn primary" style={{ flex: 1 }} href={`mailto:${p.email}?subject=${encodeURIComponent(`Booking enquiry for ${p.djName}`)}`}><Mail size={18} /> Book {p.djName}</a>
        {p.phone && <a className="btn" href={`tel:${p.phone.replace(/\s+/g, '')}`}><Phone size={18} /> Call</a>}
      </div>

      {p.bio && <section className="section"><h2>About</h2><p className="epk-text">{p.bio}</p></section>}

      {p.media.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Photos and clips</h2>
            <button className="btn small" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Cancel' : 'Select'}</button>
          </div>
          {photos.length > 0 && videos.length > 0 && (
            <div className="epk-chips" style={{ margin: '0 0 12px' }}>
              {[['all', `All (${p.media.length})`], ['photos', `Photos (${photos.length})`], ['videos', `Videos (${videos.length})`]].map(([id, label]) => (
                <button key={id} className={`chip${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
          )}
          {selecting && <p className="hint" style={{ margin: '0 0 10px' }}>Tap the ones you want, then download.</p>}
          <div className="epk-grid">
            {shown.map((m, k) => (
              <button key={m.id} className={`epk-tile${picked.has(m.id) ? ' picked' : ''}`} onClick={() => tap(m, k)}
                aria-label={selecting ? `Select ${m.kind}` : `Open ${m.kind}`}>
                {m.kind === 'photo'
                  ? <img src={mediaUrl(m)} alt={`${p.djName} press photo`} loading="lazy" />
                  : <video src={`${mediaUrl(m)}#t=0.1`} muted playsInline preload="metadata" />}
                {m.kind === 'video' && <span className="epk-play"><Play size={18} fill="currentColor" /></span>}
                {selecting && <span className="epk-check">{picked.has(m.id) && <Check size={16} />}</span>}
              </button>
            ))}
          </div>
          {!selecting && (
            <button className="btn block" style={{ marginTop: 12 }} disabled={zipping !== null}
              onClick={() => download(shown, `${slug}-press-pack${filter === 'all' ? '' : '-' + filter}.zip`)}>
              <Download size={18} /> {zipLabel || `Download all ${filter === 'all' ? '' : filter + ' '}(${totalSize(shown)})`}
            </button>
          )}
        </section>
      )}

      {p.playedAt?.length > 0 && (
        <section className="section"><h2>Played at</h2><div className="epk-chips">{p.playedAt.map((v) => <span key={v} className="pill muted">{v}</span>)}</div></section>
      )}

      {p.rider && <section className="section"><h2>Tech rider</h2><p className="epk-text card">{p.rider}</p></section>}

      <footer className="epk-foot">
        <a href={`mailto:${p.email}`}>{p.email}</a>{p.phone && <> · <a href={`tel:${p.phone.replace(/\s+/g, '')}`}>{p.phone}</a></>}
      </footer>

      {selecting && (
        <div className="epk-selectbar">
          <button className="btn" onClick={() => setPicked(new Set(shown.map((m) => m.id)))}>All</button>
          <button className="btn primary" style={{ flex: 1 }} disabled={!chosen.length || zipping !== null}
            onClick={() => download(chosen, `${slug}-press-pack-selected.zip`).then(stopSelecting)}>
            <Download size={18} /> {zipLabel || (chosen.length ? `Download ${chosen.length} (${totalSize(chosen)})` : 'Select some')}
          </button>
        </div>
      )}

      {viewing !== null && <Viewer items={shown} start={viewing} fileName={fileName} onClose={() => setViewing(null)} />}
    </div>
  );
}
