// The public press pack for promoters (/epk). No login: shows only what you've chosen in the app.
import { useEffect, useState } from 'react';
import { Mail, Phone, Download, Camera, Music, Video, ExternalLink, MapPin } from 'lucide-react';
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

const LINKS = [
  ['instagram', 'Instagram', Camera], ['tiktok', 'TikTok', Video], ['soundcloud', 'SoundCloud', Music],
  ['mixcloud', 'Mixcloud', Music], ['youtube', 'YouTube', Video],
];

const sizeLabel = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

export default function PressPage() {
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
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
  const cover = photos[0];
  const named = (list) => list.map((m, i) => ({ url: mediaUrl(m), size: m.size, name: `${slug}-${m.kind}-${String(i + 1).padStart(2, '0')}${m.ext ? '.' + m.ext : ''}` }));
  const downloadAll = async (list, label) => {
    setZipping({ label, progress: 0 });
    try {
      saveBlob(await zipFiles(named(list), (progress) => setZipping({ label, progress })), `${slug}-press-pack${label === 'photos' ? '-photos' : ''}.zip`);
    } catch {
      alert("The download didn't finish. Please try again.");
    }
    setZipping(null);
  };
  const totalSize = (list) => sizeLabel(list.reduce((a, m) => a + m.size, 0));
  const links = LINKS.filter(([k]) => p.links[k]);

  return (
    <div className="public epk">
      <header className="epk-hero" style={cover ? { backgroundImage: `linear-gradient(180deg, rgba(11,10,16,0.15), var(--bg)), url(${mediaUrl(cover)})` } : undefined}>
        <div className="eyebrow">Press pack</div>
        <div className="wordmark"><span>{p.djName}</span></div>
        {p.tagline && <p className="epk-tagline">{p.tagline}</p>}
        {p.basedIn && <p className="row-sub"><MapPin size={13} /> {p.basedIn}</p>}
        {p.genres?.length > 0 && <div className="epk-chips">{p.genres.map((g) => <span key={g} className="pill gold">{g}</span>)}</div>}
      </header>

      <div className="btn-row">
        <a className="btn primary" style={{ flex: 1 }} href={`mailto:${p.email}?subject=${encodeURIComponent(`Booking enquiry for ${p.djName}`)}`}><Mail size={18} /> Book {p.djName}</a>
        {p.phone && <a className="btn" href={`tel:${p.phone.replace(/\s+/g, '')}`}><Phone size={18} /> Call</a>}
      </div>

      {p.bio && <section className="section"><h2>About</h2><p className="epk-text">{p.bio}</p></section>}

      {p.media.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Photos and clips</h2></div>
          <div className="epk-grid">
            {p.media.map((m) => (
              <figure key={m.id} className="epk-tile">
                {m.kind === 'photo'
                  ? <a href={mediaUrl(m)} target="_blank" rel="noreferrer"><img src={mediaUrl(m)} alt={`${p.djName} press photo`} loading="lazy" /></a>
                  : <video src={`${mediaUrl(m)}#t=0.1`} controls playsInline preload="metadata" />}
                <a className="epk-dl" href={`${mediaUrl(m)}?download=1`} aria-label="Download"><Download size={15} /></a>
              </figure>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={!!zipping} onClick={() => downloadAll(p.media, 'all')}>
              <Download size={18} /> {zipping?.label === 'all' ? `Zipping… ${Math.round(zipping.progress * 100)}%` : `Download all (${totalSize(p.media)})`}
            </button>
            {photos.length > 0 && photos.length < p.media.length && (
              <button className="btn" disabled={!!zipping} onClick={() => downloadAll(photos, 'photos')}>
                <Camera size={18} /> {zipping?.label === 'photos' ? `Zipping… ${Math.round(zipping.progress * 100)}%` : 'Photos only'}
              </button>
            )}
          </div>
        </section>
      )}

      {p.playedAt?.length > 0 && (
        <section className="section"><h2>Played at</h2><div className="epk-chips">{p.playedAt.map((v) => <span key={v} className="pill muted">{v}</span>)}</div></section>
      )}

      {links.length > 0 && (
        <section className="section">
          <h2>Listen and follow</h2>
          <div className="list" style={{ marginTop: 10 }}>
            {links.map(([k, label, Icon]) => (
              <a key={k} className="row" href={linkFor(k, p.links[k])} target="_blank" rel="noreferrer">
                <div className="alert-icon violet"><Icon size={18} /></div>
                <div className="row-main"><div className="row-title">{label}</div><div className="row-sub">{p.links[k]}</div></div>
                <ExternalLink size={16} color="var(--faint)" />
              </a>
            ))}
          </div>
        </section>
      )}

      {p.rider && <section className="section"><h2>Tech rider</h2><p className="epk-text card">{p.rider}</p></section>}

      <footer className="epk-foot">
        <a href={`mailto:${p.email}`}>{p.email}</a>{p.phone && <> · <a href={`tel:${p.phone.replace(/\s+/g, '')}`}>{p.phone}</a></>}
      </footer>
    </div>
  );
}
