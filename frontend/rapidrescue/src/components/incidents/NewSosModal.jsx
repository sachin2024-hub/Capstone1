import { useEffect, useRef } from 'react';
import Icon from '../common/Icon';
import { formatDate } from '../../utils/formatDate';
import styles from './NewSosModal.module.css';

const MAX_LISTED = 4;

/**
 * Full-screen emergency popup shown on ANY admin page when a new help request arrives.
 * It stays until an admin opens the request or dismisses it (the siren keeps ringing until the
 * request has been opened, so dismissing the popup never silences a waiting request).
 *
 * `alerts` is newest-first: [{ id, type, outside, reporter, phone, place, pressedAt, offlineDelay }]
 * `soundStatus`: 'on' | 'blocked' (browser waits for a click) | 'off' (admin turned the alarm off)
 */
export default function NewSosModal({ alerts, soundStatus = 'on', onView, onDismiss }) {
  const viewRef = useRef(null);

  useEffect(() => {
    viewRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (!alerts?.length) return null;

  const allOutside = alerts.every((a) => a.outside);
  const many = alerts.length > 1;
  const listed = alerts.slice(0, MAX_LISTED);
  const hidden = alerts.length - listed.length;

  return (
    <div className={styles.backdrop}>
      <div
        className={`${styles.modal} ${allOutside ? styles.modalOutside : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="new-sos-title"
      >
        <div className={styles.header}>
          <span className={styles.siren} aria-hidden="true">
            <Icon name={allOutside ? 'location_off' : 'emergency_home'} size={28} filled />
          </span>
          <div>
            <h2 id="new-sos-title" className={styles.title}>
              {many ? `${alerts.length} new help requests` : 'New help request'}
            </h2>
            <p className={styles.subtitle}>
              {allOutside ? 'Outside the city boundary' : 'Cabadbaran City'} · needs immediate attention
            </p>
          </div>
        </div>

        <ul className={styles.list}>
          {listed.map((a) => (
            <li key={a.id} className={styles.item}>
              <div className={styles.itemTop}>
                <strong>#{a.id} · {a.type || 'Emergency'}</strong>
              </div>
              <div className={styles.meta}>
                <span><Icon name="person" size={15} /> {a.reporter || 'Unknown reporter'}{a.phone ? ` · ${a.phone}` : ''}</span>
                <span><Icon name="location_on" size={15} /> {a.place || '—'}</span>
                <span><Icon name="schedule" size={15} /> {formatDate(a.pressedAt)}</span>
              </div>
              {a.offlineDelay && (
                <span className={styles.offline}>
                  <Icon name="wifi_off" size={13} /> Sent offline · pressed {a.offlineDelay} ago
                </span>
              )}
            </li>
          ))}
          {hidden > 0 && <li className={styles.more}>+ {hidden} more request{hidden > 1 ? 's' : ''}</li>}
        </ul>

        {soundStatus === 'blocked' && (
          <p className={styles.soundHint}>
            <Icon name="volume_off" size={16} /> The browser is blocking the siren. Click anywhere to turn the sound on.
          </p>
        )}
        {soundStatus === 'off' && (
          <p className={styles.soundHint}>
            <Icon name="notifications_off" size={16} /> The alarm is turned off, so there is no siren.
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onDismiss}>
            Dismiss
          </button>
          <button ref={viewRef} type="button" className={styles.primary} onClick={onView}>
            {many ? 'View requests' : 'View request'}
          </button>
        </div>
      </div>
    </div>
  );
}
