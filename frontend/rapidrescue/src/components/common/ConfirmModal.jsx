import styles from './ConfirmModal.module.css';

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
  const iconClass = {
    danger: styles.iconDanger,
    warning: styles.iconWarning,
    info: styles.iconInfo,
  }[variant] || styles.iconDanger;

  const confirmClass = {
    danger: styles.confirmBtnDanger,
    warning: styles.confirmBtnWarning,
    info: styles.confirmBtnInfo,
  }[variant] || styles.confirmBtnDanger;

  const icon = {
    danger: '🗑️',
    warning: '⚠️',
    info: '↪',
  }[variant] || '⚠️';

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`${styles.iconWrap} ${iconClass}`}>{icon}</div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`${styles.confirmBtn} ${confirmClass}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
