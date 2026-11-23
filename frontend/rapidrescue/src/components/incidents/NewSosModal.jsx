import { useEffect, useRef, useState } from 'react';
import Icon from '../common/Icon';
import { formatDate } from '../../utils/formatDate';
import styles from './NewSosModal.module.css';

/**
 * Emergency popup shown on ANY admin page when help requests arrive, drawn as a stack of cards.
 * The newest request is always on top; older ones peek out behind it. When another request
 * arrives while the popup is open, it slides in on top with a NEW tag (never just a new line).
 * The siren keeps ringing until a request has been opened, so dismissing never silences it.
 *
 * `alerts` is newest-first: [{ id, type, outside, reporter, phone, place, pressedAt, offlineDelay }]
 * `soundStatus`: 'on' | 'blocked' (browser waits for a click) | 'off' (admin turned the alarm off)
 * `onView(alert)` opens that request, `onDismissOne(id)` removes one card, `onDismiss()` closes all.
 */
export default function NewSosModal({ alerts, soundStatus = 'on', onView, onDismiss, onDismissOne }) {
  const viewRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [flashId, setFlashId] = useState(null);
  const newestId = alerts?.[0]?.id;
  const count = alerts?.length || 0;

  // a request that just arrived jumps to the top and gets the NEW tag for a few seconds
  const lastNewest = useRef(null);
  useEffect(() => {
    if (newestId == null) return undefined;
    if (lastNewest.current != null && lastNewest.current !== newestId) {
      setIndex(0);
      setFlashId(newestId);
      const t = setTimeout(() => setFlashId(null), 6000);
      lastNewest.current = newestId;
      return () => clearTimeout(t);
    }
    lastNewest.current = newestId;
    return undefined;
  }, [newestId]);

  const at = Math.min(index, Math.max(0, count - 1));

  useEffect(() => {
    viewRef.current?.focus();
  }, [newestId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.min(Math.max(0, count - 1), i + 1)); // earlier
      if (e.key === 'ArrowRight') setIndex((i) => Math.max(0, i - 1)); // later
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss, count]);

  if (!count) return null;

  const a = alerts[at];
  const many = count > 1;
  const outside = a.outside;
  const behind = Math.min(2, count - 1 - at); // cards peeking out behind the current one
  const order = count - at; // 1 = the first request that arrived
  const isFirst = order === 1;
  const isLatest = order === count;

  return (
    <div className={styles.backdrop}>
      <div className={styles.stack}>
        {behind >= 2 && <div className={`${styles.ghost} ${styles.ghost2}`} aria-hidden="true" />}
        {behind >= 1 && <div className={`${styles.ghost} ${styles.ghost1}`} aria-hidden="true" />}

        <div
          key={a.id}
          className={`${styles.modal} ${outside ? styles.modalOutside : ''} ${flashId === a.id ? styles.modalFresh : ''}`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="new-sos-title"
        >
          <div className={styles.header}>
            <span className={styles.siren} aria-hidden="true">
              <Icon name={outside ? 'location_off' : 'emergency_home'} size={28} filled />
            </span>
            <div className={styles.headerText}>
              <h2 id="new-sos-title" className={styles.title}>
                {many ? `${count} new help requests` : 'New help request'}
              </h2>
              <p className={styles.subtitle}>
                {outside ? 'Outside the city boundary' : 'Cabadbaran City'} · needs immediate attention
              </p>
            </div>
            {many && <span className={styles.countBadge} aria-hidden="true">{count}</span>}
          </div>

          <div className={styles.item}>
            <div className={styles.orderRow}>
              <span className={styles.orderTag}>
                {many ? `Request ${order} of ${count}` : 'Request'}
              </span>
              {many && isFirst && <span className={styles.firstTag}>First · waiting longest</span>}
              {many && isLatest && <span className={styles.latestTag}>Latest</span>}
              {flashId === a.id && <span className={styles.newTag}>NEW</span>}
            </div>
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
          </div>

          {many && (
            <div className={styles.pager}>
              <button type="button" className={styles.pagerBtn} onClick={() => setIndex(at + 1)} disabled={at >= count - 1} aria-label="Earlier request">
                <Icon name="chevron_left" size={20} />
              </button>
              <span className={styles.pagerText}>{order} of {count}</span>
              <button type="button" className={styles.pagerBtn} onClick={() => setIndex(at - 1)} disabled={at === 0} aria-label="Later request">
                <Icon name="chevron_right" size={20} />
              </button>
            </div>
          )}

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
            {many && (
              <button type="button" className={styles.link} onClick={onDismiss}>
                Dismiss all
              </button>
            )}
            <button type="button" className={styles.secondary} onClick={() => (many && onDismissOne ? onDismissOne(a.id) : onDismiss())}>
              Dismiss
            </button>
            <button ref={viewRef} type="button" className={styles.primary} onClick={() => onView(a)}>
              View request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
