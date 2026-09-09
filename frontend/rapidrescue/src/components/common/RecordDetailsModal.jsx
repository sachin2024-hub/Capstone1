import Icon from './Icon';
import styles from './RecordDetailsModal.module.css';

export default function RecordDetailsModal({ title, fields = [], onClose, onEdit }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h3>{title}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.grid}>
          {fields.map((field) => (
            <div
              key={field.label}
              className={`${styles.cell} ${field.wide ? styles.wide : ''}`}
            >
              <div className={styles.label}>{field.label}</div>
              <div className={styles.value}>{field.value || '—'}</div>
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          {onEdit && (
            <button type="button" className={styles.editBtn} onClick={onEdit}>
              <Icon name="edit" size={16} /> Edit
            </button>
          )}
          <button type="button" className={styles.closeAction} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
