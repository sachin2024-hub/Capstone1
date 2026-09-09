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
                  onClick={() => setReason(item.id)}
                >
                  <span className={styles.reasonName}>{item.label}</span>
                  <span className={styles.reasonDetail}>{item.detail}</span>
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
            disabled={Boolean(reasonOptions?.length) && !reason}
            onClick={() => onConfirm?.(reasonOptions?.length ? reason : undefined)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
