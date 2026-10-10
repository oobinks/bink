import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/login', { method: 'POST', body: { password } });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-box">
        <div className="wordmark"><span>ctrinn</span></div>
        <div className="wordmark-sub">DJ HQ</div>
        <form className="card" onSubmit={submit}>
          <h3>Welcome back</h3>
          <p className="lead">Log in once and this device stays logged in for 6 months.</p>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <button className="btn primary block" disabled={busy || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
          {error && <div className="msg err">{error}</div>}
        </form>
      </div>
    </div>
  );
}
