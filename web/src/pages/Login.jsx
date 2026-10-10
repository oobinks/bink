import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ firstRun, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (firstRun && password !== confirm) return setError("The two passwords don't match");
    setBusy(true);
    try {
      await api(firstRun ? '/auth/setup' : '/auth/login', { method: 'POST', body: { password } });
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
          <h3>{firstRun ? 'Choose your password' : 'Welcome back'}</h3>
          <p className="lead">
            {firstRun
              ? "You're the only person who can log in. Pick something at least 8 characters long."
              : 'Log in once and your phone stays logged in for 6 months.'}
          </p>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" autoComplete={firstRun ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          {firstRun && (
            <div className="field">
              <label htmlFor="pw2">Type it again</label>
              <input id="pw2" className="input" type="password" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          )}
          <button className="btn primary block" disabled={busy || !password}>{firstRun ? 'Set password' : 'Log in'}</button>
          {error && <div className="msg err">{error}</div>}
        </form>
      </div>
    </div>
  );
}
