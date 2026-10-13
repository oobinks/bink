import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { House, CalendarDays, Receipt, Clapperboard, Menu } from 'lucide-react';
import PullToRefresh from './PullToRefresh.jsx';

const tabs = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
  { to: '/content', label: 'Content', icon: Clapperboard },
  { to: '/more', label: 'More', icon: Menu },
];

export default function Layout() {
  const shell = useRef();
  const { pathname } = useLocation();
  // On phones the page itself stays still and only the app scrolls inside it, so the bottom bar
  // can't get dragged along when iPhone "bounces" the page (see .in-app in styles.css).
  useEffect(() => {
    document.documentElement.classList.add('in-app');
    return () => document.documentElement.classList.remove('in-app');
  }, []);
  // Each new screen starts at the top.
  useEffect(() => { shell.current?.scrollTo(0, 0); window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="shell" ref={shell}>
      <PullToRefresh />
      <nav className="tabbar">
        <div className="brand">
          <div className="wordmark"><span>ctrinn</span></div>
          <div className="wordmark-sub">DJ HQ</div>
        </div>
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            <Icon size={22} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
