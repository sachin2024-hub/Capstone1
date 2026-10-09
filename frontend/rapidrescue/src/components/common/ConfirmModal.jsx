import { useState } from 'react';
import Icon from './Icon';
import styles from './ConfirmModal.module.css';

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  reasonOptions,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [otherNote, setOtherNote] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState('');
  const otherSelected = reason === 'others';
  const otherReady = otherNote.trim().length > 0;
  const iconClass = {
    danger: styles.iconDanger,
    warning: styles.iconWarning,
    info: styles.iconInfo,
    logout: styles.iconLogout,
  }[variant] || styles.iconDanger;

  const confirmClass = {
    danger: styles.confirmBtnDanger,
    warning: styles.confirmBtnWarning,
    info: styles.confirmBtnInfo,
    logout: styles.confirmBtnLogout,
  }[variant] || styles.confirmBtnDanger;

  const icon = {
    danger: 'delete',
    warning: 'warning',
    info: 'logout',
    logout: 'logout',
  }[variant] || 'warning';

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`${styles.iconWrap} ${iconClass}`}><Icon name={icon} size={28} /></div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        {reasonOptions?.length > 0 && (
          <div className={styles.reasonBox}>
            <p className={styles.reasonLabel}>Reason for blocking</p>
            <div className={styles.reasonList}>
              {reasonOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.reasonItem} ${reason === item.id ? styles.reasonItemActive : ''}`}
                  onClick={() => {
                    if (item.id === 'others') {
                      setOtherDraft(otherNote);
                      setOtherOpen(true);
                      return;
                    }
                    setReason(item.id);
                  }}
                >
                  <span className={styles.reasonName}>{item.label}</span>
                  <span className={styles.reasonDetail}>
                    {item.id === 'others' && otherNote ? otherNote : item.detail}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.confirmBtn} ${confirmClass}`}
            disabled={Boolean(reasonOptions?.length) && (!reason || (otherSelected && !otherReady))}
            onClick={() => {
              if (!reasonOptions?.length) {
                onConfirm?.();
                return;
              }
              if (otherSelected) {
                const note = otherNote.replace(/\s+/g, ' ').trim().slice(0, 160);
                onConfirm?.(`others::${note}`);
                return;
              }
              onConfirm?.(reason);
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      {otherOpen && (
        <div
          className={styles.otherOverlay}
          onClick={(e) => {
            e.stopPropagation();
            setOtherOpen(false);
          }}
        >
          <div
            className={styles.otherPopup}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Other reason"
          >
            <h4 className={styles.otherTitle}>Others</h4>
            <p className={styles.otherHint}>I-type ang specific nga rason.</p>
            <textarea
              className={styles.otherNote}
              value={otherDraft}
              maxLength={160}
              rows={4}
              autoFocus
              placeholder="I-type ang rason..."
              onChange={(e) => setOtherDraft(e.target.value)}
            />
            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setOtherOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.confirmBtn} ${confirmClass}`}
                disabled={!otherDraft.trim()}
                onClick={() => {
                  setOtherNote(otherDraft.replace(/\s+/g, ' ').trim().slice(0, 160));
                  setReason('others');
                  setOtherOpen(false);
                }}
              >
                Use this reason
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
