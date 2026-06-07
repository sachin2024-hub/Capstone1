import { useState } from 'react';
import { INCIDENT_STATUSES, updateIncidentStatus } from '../../services/incidentService';
import { STATUS_COLORS } from '../../constants/statusColors';
import styles from './IncidentStatusModal.module.css';

export default function IncidentStatusModal({ incident, onClose, onUpdated }) {
  const [status, setStatus] = useState(incident?.incident_status || 'Pending');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!incident) return null;

  const dispatch = Array.isArray(incident.dispatch) ? incident.dispatch[0] : incident.dispatch;
  const responder = dispatch?.responders;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateIncidentStatus(incident.incident_id, status);
      onUpdated?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  const selectedHint = INCIDENT_STATUSES.find((s) => s.value === status)?.hint;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Update Incident Status</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.incidentInfo}>
          <span className={styles.incidentId}>#{incident.incident_id}</span>
          <span className={styles.incidentType}>{incident.incident_type}</span>
          {incident.users && (
            <p className={styles.reporter}>
              👤 {incident.users.first_name} {incident.users.last_name}
            </p>
          )}
          {responder && (
            <p className={styles.responder}>
              🚑 {responder.first_name} {responder.last_name} — {responder.responder_type}
            </p>
          )}
        </div>

        <label className={styles.label}>Status (visible to user on mobile)</label>
        <select
          className={styles.select}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={saving}
        >
          {INCIDENT_STATUSES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {selectedHint && (
          <p className={styles.hint}>
            📱 User will see: <strong>{selectedHint}</strong>
          </p>
        )}

        <div className={styles.preview}>
          <span className={styles.previewLabel}>Preview:</span>
          <span
            className={styles.previewBadge}
            style={{ background: STATUS_COLORS[status] || '#9E9E9E' }}
          >
            {status}
          </span>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : '💾 Save Status'}
          </button>
        </div>
      </div>
    </div>
  );
}
