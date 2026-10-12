// Pull down from the top of any screen to reload the whole app.
// (Apps added to the iPhone home screen don't have this built in.)
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const TRIGGER = 70; // how far to pull (after resistance) before letting go reloads

function scrolledParent(el) {
  // Don't hijack a pull that starts inside something that scrolls itself (e.g. a long text box).
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollTop > 0) return true;
  }
  return false;
}

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (e) => {
      if (refreshing || window.scrollY > 0 || e.touches.length !== 1 || scrolledParent(e.target)) {
        start.current = null;
        return;
      }
      start.current = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const d = Math.min(120, dy * 0.5); // resistance
      pullRef.current = d;
      setPull(d);
    };
    const onEnd = async () => {
      if (start.current === null) return;
      start.current = null;
      if (pullRef.current >= TRIGGER) {
        setRefreshing(true);
        setPull(TRIGGER);
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          await reg?.update();
        } catch { /* offline is fine */ }
        window.location.reload();
      } else {
        setPull(0);
      }
      pullRef.current = 0;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshing]);

  if (!pull && !refreshing) return null;
  const ready = pull >= TRIGGER;
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 40) }} aria-live="polite">
      <RefreshCw size={20} className={refreshing ? 'spin' : ''}
        style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)`, color: ready ? 'var(--gold)' : 'var(--muted)' }} />
      <span className="sr-only">{refreshing ? 'Refreshing' : ready ? 'Release to refresh' : 'Pull to refresh'}</span>
    </div>
  );
}
