// The public landing page at your main address (shown when you're not logged in). Kept minimal on purpose.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PartyPopper, Newspaper, Mail } from 'lucide-react';
import { LINKS, linkFor } from './PressPage.jsx';

export default function Landing() {
  const [h, setH] = useState(null);

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
          <Link className="btn primary block" to="/book"><PartyPopper size={18} /> Private party booking enquiry</Link>
          {h.pressLive && <Link className="btn block" to="/epk"><Newspaper size={18} /> Press pack</Link>}
          {h.email && <a className="btn block" href={`mailto:${h.email}`}><Mail size={18} /> Contact</a>}
        </nav>
        {h.phone && <p className="landing-phone">or call <a href={`tel:${h.phone.replace(/\s+/g, '')}`}>{h.phone}</a></p>}
      </main>
      <footer className="landing-foot"><Link to="/login">DJ login</Link></footer>
    </div>
  );
}
