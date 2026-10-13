// The public landing page at your main address (shown when you're not logged in). Kept minimal on purpose.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PartyPopper, Newspaper, Mail, ArrowLeft, Share2 } from 'lucide-react';
import { shareOrCopy } from '../share.js';
import { LINKS, linkFor } from './PressPage.jsx';

export default function Landing({ preview = false }) {
  const [h, setH] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/public/home').then((r) => r.json()).then((d) => {
      setH(d);
      document.title = d.djName ? `${d.djName} · DJ` : 'DJ';
    }).catch(() => setH({}));
  }, []);
  if (!h) return null;

  const links = LINKS.filter(([k]) => h.links?.[k]);
  return (
    <div className="landing" style={h.coverId ? { backgroundImage: `linear-gradient(180deg, rgba(11,10,16,0.35), rgba(11,10,16,0.92) 70%), url(/api/public/press/media/${h.coverId})` } : undefined}>
      {preview && (
        <div className="landing-preview">
          <Link to="/more" className="btn small"><ArrowLeft size={16} /> Back to the app</Link>
          <button className="btn small" onClick={async () => {
            if ((await shareOrCopy({ title: h.djName, url: window.location.origin })) === 'copied') { setCopied(true); setTimeout(() => setCopied(false), 2000); }
          }}><Share2 size={16} /> {copied ? 'Link copied' : 'Share'}</button>
        </div>
      )}
      <main className="landing-box">
        <div className="wordmark"><span>{h.djName || 'DJ'}</span></div>
        {h.tagline && <p className="landing-tagline">{h.tagline}</p>}
        {h.genres?.length > 0 && <p className="landing-genres">{h.genres.join(' · ')}</p>}

        {links.length > 0 && (
          <div className="landing-socials">
            {links.map(([k, label, Icon]) => (
              <a key={k} href={linkFor(k, h.links[k])} target="_blank" rel="noreferrer" aria-label={label} title={label}><Icon size={20} /></a>
            ))}
          </div>
        )}

        <nav className="landing-links">
          <Link className="btn primary block" to="/book"><PartyPopper size={18} /> Private Party Booking Enquiry</Link>
          {h.pressLive && <Link className="btn block" to="/epk"><Newspaper size={18} /> Press Pack</Link>}
          {h.email && <a className="btn block" href={`mailto:${h.email}`}><Mail size={18} /> Contact</a>}
        </nav>
      </main>
      <footer className="landing-foot">{!preview && <Link to="/login">DJ login</Link>}</footer>
    </div>
  );
}
