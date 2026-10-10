// Small helper for talking to the server.
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      // Cloudflare Access redirects to its login page when your login has expired.
      redirect: 'manual',
    });
  } catch {
    throw new Error("Can't connect. Check your internet connection.");
  }
  // A wrong password on the login screen is not "logged out".
  if (res.type === 'opaqueredirect' || (res.status === 401 && !path.startsWith('/auth/'))) {
    window.dispatchEvent(new Event('logged-out'));
    throw new Error('Please log in again');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && data.error === 'setup') {
    window.dispatchEvent(new Event('setup-needed'));
    throw new Error(data.message);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
