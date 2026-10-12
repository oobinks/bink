import { NavLink, Outlet } from 'react-router-dom';
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
  return (
    <div className="shell">
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
