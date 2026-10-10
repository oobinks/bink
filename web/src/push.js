// Turning phone notifications on for this device.
import { api } from './api.js';

const toBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

export function pushSupport() {
  if (isIOS() && !installed()) return 'install-first';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return 'ok';
}

export async function pushEnabled() {
  if (pushSupport() !== 'ok') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can change this in your phone settings.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
  await api('/push/test', { method: 'POST' });
}
