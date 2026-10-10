import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Receipt, Clapperboard, Newspaper } from 'lucide-react';
import { api } from './api.js';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';
import More from './pages/More.jsx';
import ComingSoon from './pages/ComingSoon.jsx';
import Login from './pages/Login.jsx';
import Ideas from './pages/Ideas.jsx';
import IdeaChat from './pages/IdeaChat.jsx';
import Bookings from './pages/Bookings.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import BookingEdit from './pages/BookingEdit.jsx';

function Gate({ title, children }) {
  return (
    <div className="auth">
      <div className="auth-box">
        <div className="wordmark"><span>ctrinn</span></div>
        <div className="wordmark-sub">DJ HQ</div>
        <div className="card">
          <h3>{title}</h3>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState('loading');
  const [user, setUser] = useState(null);

  const check = async () => {
    try {
      const status = await api('/auth/status');
      if (!status.loggedIn) {
        if (status.mode === 'setup') return setState('setup');
        return setState(status.mode === 'password' ? 'login' : 'logged-out');
      }
      setUser(await api('/me'));
      setState('ok');
    } catch (e) {
      setState((s) => (s === 'loading' ? 'error:' + e.message : s));
    }
  };

  useEffect(() => {
    check();
    const loggedOut = () => setState('logged-out');
    const setup = () => setState('setup');
    window.addEventListener('logged-out', loggedOut);
    window.addEventListener('setup-needed', setup);
    return () => {
      window.removeEventListener('logged-out', loggedOut);
      window.removeEventListener('setup-needed', setup);
    };
  }, []);

  if (state === 'loading') return null;
  if (state === 'login') return <Login onDone={check} />;
  if (state === 'logged-out') {
    return (
      <Gate title="Please log in again">
        <p className="lead">You've been logged out on this device.</p>
        <button className="btn primary block" onClick={() => { setState('loading'); check(); }}>Log in</button>
      </Gate>
    );
  }
  if (state === 'setup') {
    return (
      <Gate title="Almost there">
        <p className="lead">
          The app is online, but it stays locked until you've chosen your password. In your Cloudflare dashboard, add a
          secret called <b>APP_PASSWORD</b> (step 3 of the setup guide), then refresh this page.
        </p>
      </Gate>
    );
  }
  if (state.startsWith('error:')) {
    return (
      <Gate title="Can't load the app">
        <p className="lead">{state.slice(6)}</p>
        <button className="btn block" onClick={() => window.location.reload()}>Try again</button>
      </Gate>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="bookings/new" element={<BookingEdit />} />
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route path="bookings/:id/edit" element={<BookingEdit />} />
        <Route path="invoices/*" element={<ComingSoon icon={Receipt} tone="gold" title="Invoices" phase={3}
          text="One-tap invoices from bookings, automatic numbering, PDF by email, polite chasing and income by tax year." />} />
        <Route path="press/*" element={<ComingSoon icon={Newspaper} tone="violet" title="Press pack" phase={4}
          text="Photos, videos, bio and rider, published to a public press pack page that updates itself." />} />
        <Route path="content/*" element={<ComingSoon icon={Clapperboard} tone="violet" title="Content hub" phase={5}
          text="Upload your clips after a gig, star the best, add captions and schedule them for Instagram and TikTok." />} />
        <Route path="more" element={<More />} />
        <Route path="settings" element={<Settings />} />
        <Route path="ideas" element={<Ideas />} />
        <Route path="ideas/:n" element={<IdeaChat />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
