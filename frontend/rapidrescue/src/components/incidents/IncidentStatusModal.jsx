import { useState } from 'react';
import { getAvailableStatuses, updateIncidentStatus } from '../../services/incidentService';
import { STATUS_COLORS } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import { parseLocationAddress, formatAreaLabel } from '../../utils/locationFormat';
import styles from './IncidentStatusModal.module.css';

export default function IncidentStatusModal({ incident, onClose, onUpdated }) {
  const currentStatus = incident?.incident_status || 'Pending';
  const availableStatuses = getAvailableStatuses(currentStatus);
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!incident) return null;

  const dispatch = Array.isArray(incident.dispatch) ? incident.dispatch[0] : incident.dispatch;
  const responder = dispatch?.responders;
  const loc = Array.isArray(incident.locations) ? incident.locations[0] : incident.locations;
  const locationText = loc ? formatAreaLabel(parseLocationAddress(loc.address)) : '—';
  const reporterName = incident.users
    ? `${incident.users.first_name} ${incident.users.last_name}`
    : '—';
  const assignedName = responder
    ? `${responder.first_name} ${responder.last_name}`
    : 'Unassigned';

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

  const selectedHint = availableStatuses.find((s) => s.value === status)?.hint;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Incident Details</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.incidentInfo}>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>ID</span>
            <span className={styles.incidentId}>#{incident.incident_id}</span>
          </div>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>Type</span>
            <span className={styles.detailValue}>{incident.incident_type || '—'}</span>
          </div>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>Reporter</span>
            <span className={styles.detailValue}>{reporterName}</span>
          </div>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>Location</span>
            <span className={styles.detailValue}>{locationText}</span>
          </div>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>Assigned</span>
            <span className={styles.detailValue}>{assignedName}</span>
          </div>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>Status</span>
            <span
              className={styles.previewBadge}
              style={{ background: STATUS_COLORS[currentStatus] || '#9E9E9E' }}
            >
              {currentStatus}
            </span>
          </div>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>Priority</span>
            <span className={styles.detailValue}>{incident.priority_level || 'Normal'}</span>
          </div>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>Date</span>
            <span className={styles.detailValue}>{formatDate(incident.date_reported)}</span>
          </div>
          <div className={`${styles.detailCell} ${styles.detailCellFull}`}>
            <span className={styles.detailLabel}>Description</span>
            <span className={styles.detailValue}>{incident.incident_description || '—'}</span>
          </div>
        </div>

        <label className={styles.label}>Status (visible to user on mobile)</label>
        <select
          className={styles.select}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={saving}
        >
          {availableStatuses.map((opt) => (
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
