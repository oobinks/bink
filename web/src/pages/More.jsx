import { Link } from 'react-router-dom';
import { Settings, Newspaper, LogOut, ChevronRight, History, Sparkles, Users } from 'lucide-react';
import { api } from '../api.js';

export default function More() {
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  };
  return (
    <>
      <div className="page-head"><h1>More</h1></div>
      <div className="list">
        <Link to="/clients" className="row">
          <div className="alert-icon gold"><Users size={20} /></div>
          <div className="row-main"><div className="row-title">Clients</div><div className="row-sub">Everyone you've worked for</div></div>
          <ChevronRight size={18} color="var(--faint)" />
        </Link>
        <Link to="/ideas" className="row">
          <div className="alert-icon pink"><Sparkles size={20} /></div>
          <div className="row-main"><div className="row-title">Improve the app</div><div className="row-sub">Chat with Claude about changes</div></div>
          <ChevronRight size={18} color="var(--faint)" />
        </Link>
        <Link to="/press" className="row">
          <div className="alert-icon violet"><Newspaper size={20} /></div>
          <div className="row-main"><div className="row-title">Press pack</div><div className="row-sub">Photos, bio, rider, public page</div></div>
          <ChevronRight size={18} color="var(--faint)" />
        </Link>
        <Link to="/settings" className="row">
          <div className="alert-icon gold"><Settings size={20} /></div>
          <div className="row-main"><div className="row-title">Settings</div><div className="row-sub">Your details, bank, backups, export</div></div>
          <ChevronRight size={18} color="var(--faint)" />
        </Link>
        <Link to="/settings?tab=history" className="row">
          <div className="alert-icon muted"><History size={20} /></div>
          <div className="row-main"><div className="row-title">Change history</div><div className="row-sub">Everything that's changed, and when</div></div>
          <ChevronRight size={18} color="var(--faint)" />
        </Link>
        <button className="row" onClick={logout} style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }}>
          <div className="alert-icon muted"><LogOut size={20} /></div>
          <div className="row-main"><div className="row-title">Log out</div><div className="row-sub">Only needed on a shared device</div></div>
        </button>
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: 20 }}>App version: {__APP_VERSION__}</p>
    </>
  );
}
