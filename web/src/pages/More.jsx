import { Link } from 'react-router-dom';
import { Settings, Newspaper, LogOut, ChevronRight } from 'lucide-react';
import { api } from '../api.js';

export default function More({ onLogout }) {
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); };
  return (
    <>
      <div className="page-head"><h1>More</h1></div>
      <div className="list">
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
        <button className="row" onClick={logout} style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }}>
          <div className="alert-icon muted"><LogOut size={20} /></div>
          <div className="row-main"><div className="row-title">Log out</div><div className="row-sub">Only needed on a shared device</div></div>
        </button>
      </div>
    </>
  );
}
