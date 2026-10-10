import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { CalendarDays, Receipt, Clapperboard, Newspaper } from 'lucide-react';
import { api } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';
import More from './pages/More.jsx';
import ComingSoon from './pages/ComingSoon.jsx';

export default function App() {
  const [auth, setAuth] = useState(null);

  const check = () => api('/auth/status').then(setAuth).catch(() => setAuth({ error: true }));
  useEffect(() => {
    check();
    const onLogout = () => setAuth((a) => ({ ...a, loggedIn: false }));
    window.addEventListener('logged-out', onLogout);
    return () => window.removeEventListener('logged-out', onLogout);
  }, []);

  if (!auth) return null;
  if (auth.error) {
    return <div className="auth"><p className="msg err">Can't reach the app on your Mac. Is it switched on and awake?</p></div>;
  }
  if (!auth.loggedIn) return <Login firstRun={auth.needsSetup} onDone={check} />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="bookings/*" element={<ComingSoon icon={CalendarDays} tone="pink" title="Bookings & quotes" phase={2}
          text="Enquiries from your Google Form, the pipeline, price presets, PDF quotes and the gig calendar." />} />
        <Route path="invoices/*" element={<ComingSoon icon={Receipt} tone="gold" title="Invoices" phase={3}
          text="One-tap invoices from bookings, automatic numbering, PDF by email, polite chasing and income by tax year." />} />
        <Route path="press/*" element={<ComingSoon icon={Newspaper} tone="violet" title="Press pack" phase={4}
          text="Photos, videos, bio and rider, published to a public press pack page that updates itself." />} />
        <Route path="content/*" element={<ComingSoon icon={Clapperboard} tone="violet" title="Content hub" phase={5}
          text="Upload your clips after a gig, star the best, add captions and schedule them for Instagram and TikTok." />} />
        <Route path="more" element={<More onLogout={check} />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
