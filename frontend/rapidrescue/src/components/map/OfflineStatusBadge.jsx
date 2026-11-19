import { useEffect, useState } from 'react';
import { loadBasemap } from './basemapData';
import { offlineRoadsReady } from './offlineRouter';
import styles from './OfflineStatusBadge.module.css';

/**
 * Small badge on the map showing (1) whether the device is online/offline and
 * (2) whether the offline map + offline routing data are loaded and ready.
 */
export default function OfflineStatusBadge() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [ready, setReady] = useState('loading'); // loading | ready | failed

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([loadBasemap().then(() => true, () => false), offlineRoadsReady()]).then(
      ([mapOk, roadsOk]) => {
        if (alive) setReady(mapOk && roadsOk ? 'ready' : 'failed');
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={`${styles.pill} ${online ? styles.online : styles.offline}`}>
        <span className={styles.dot} />
        {online ? 'Online' : 'Offline mode'}
      </span>
      <span
        className={`${styles.pill} ${
          ready === 'ready' ? styles.ready : ready === 'failed' ? styles.failed : styles.loading
        }`}
      >
        {ready === 'ready' && '✓ Offline map & routing ready'}
        {ready === 'loading' && 'Preparing offline map…'}
        {ready === 'failed' && '✕ Offline map data missing'}
      </span>
    </div>
  );
}
