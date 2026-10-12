// Uploads a clip to your storage in 20MB pieces, so a dropped signal only redoes one piece.
import { api } from './api.js';

const PIECE = 20 * 1024 * 1024;

async function sendPiece(id, n, blob) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`/api/clips/${id}/part?n=${n}`, { method: 'PUT', body: blob, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      if (res.status < 500 || attempt >= 3) throw new Error(data.error || `Upload failed (${res.status})`);
    } catch (err) {
      if (attempt >= 3) throw err instanceof TypeError ? new Error('Lost connection. Tap to try again.') : err;
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

export async function uploadClip(file, bookingId, onProgress, { press = false } = {}) {
  const { id } = await api('/clips/upload', {
    method: 'POST',
    body: { booking_id: bookingId || null, file_name: file.name, content_type: file.type, size: file.size, press },
  });
  const parts = [];
  for (let start = 0, n = 1; start < file.size; start += PIECE, n++) {
    parts.push(await sendPiece(id, n, file.slice(start, start + PIECE)));
    onProgress?.(Math.min(1, (start + PIECE) / file.size));
  }
  await api(`/clips/${id}/complete`, { method: 'POST', body: { parts } });
  return id;
}

// Keeps the phone screen awake while uploading (where the phone allows it).
export async function keepAwake() {
  try {
    return await navigator.wakeLock?.request('screen');
  } catch {
    return null;
  }
}
