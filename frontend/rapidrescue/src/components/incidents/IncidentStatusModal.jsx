import { useState } from 'react';
import { getAvailableStatuses, getOutsideStatuses, OUTSIDE_STATUS_VALUES, updateIncidentStatus } from '../../services/incidentService';
import { assignResponder } from '../../services/dispatchService';
import { STATUS_COLORS, PRIORITY_COLORS } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import { formatIncidentLocation } from '../../utils/locationFormat';
import { isWithinCabadbaran } from '../../utils/geofence';
import styles from './IncidentStatusModal.module.css';

export default function IncidentStatusModal({ incident, responders = [], users = [], onClose, onUpdated }) {
  const currentStatus = incident?.incident_status || 'Pending';
  const dispatch = Array.isArray(incident?.dispatch) ? incident.dispatch[0] : incident?.dispatch;
  const responder = dispatch?.responders;
  const assignedResponderId = responder?.responder_id || dispatch?.responder_id;
  const isAssigned = Boolean(assignedResponderId || responder);
  const loc = Array.isArray(incident.locations) ? incident.locations[0] : incident.locations;
  const isOutside =
    OUTSIDE_STATUS_VALUES.includes(currentStatus) ||
    (loc?.latitude != null &&
      loc?.longitude != null &&
      !isWithinCabadbaran(Number(loc.latitude), Number(loc.longitude)));
  const availableStatuses = isOutside
    ? getOutsideStatuses(currentStatus)
    : getAvailableStatuses(currentStatus);
  const [status, setStatus] = useState(
    isOutside && currentStatus === 'Pending' ? 'Outside' : currentStatus
  );
  const [responderId, setResponderId] = useState(
    assignedResponderId ? String(assignedResponderId) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!incident) return null;

  const locationText = formatIncidentLocation(loc);
  const nestedUser = Array.isArray(incident.users) ? incident.users[0] : (incident.users || incident.user);
  const registeredUser = (users || []).find(
    (u) => Number(u.user_id) === Number(incident.user_id)
  ) || nestedUser;
  const reporterName = registeredUser
    ? `${registeredUser.first_name || ''} ${registeredUser.last_name || ''}`.trim() || '—'
    : '—';
  const reporterPhone = registeredUser?.phone_number || '';
  const assignedName = responder
    ? `${responder.first_name} ${responder.last_name}`
    : 'Unassigned';
  const selectedHint = availableStatuses.find((s) => s.value === status)?.hint;
  const availableResponders = (responders || []).filter((r) => {
    const isCurrent = assignedResponderId && Number(r.responder_id) === Number(assignedResponderId);
    if (isCurrent) return true;
    if (r.occupied) return false;
    return String(r.availability_status || '').toLowerCase() === 'available';
  });

  const handleSave = async () => {
    if (!isOutside && !isAssigned && !responderId) {
      setError('Assign a responder first before saving the status.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      let statusNow = currentStatus;
      if (!isOutside && !isAssigned && responderId) {
        await assignResponder(incident.incident_id, Number(responderId));
        if (statusNow === 'Pending') statusNow = 'In Progress';
      }
      if (status !== statusNow) {
        await updateIncidentStatus(incident.incident_id, status);
      }
      onUpdated?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

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
            <span className={styles.detailLabel}>Mobile Number</span>
            {reporterPhone ? (
              <a className={styles.phoneLink} href={`tel:${reporterPhone}`}>
                {reporterPhone}
              </a>
            ) : (
              <span className={styles.detailValue}>—</span>
            )}
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
            <span
              className={styles.previewBadge}
              style={{
                background: PRIORITY_COLORS[incident.priority_level] || PRIORITY_COLORS.Normal,
                color: (incident.priority_level || 'Normal') === 'Normal' ? '#1a1a1a' : '#fff',
              }}
            >
              {incident.priority_level || 'Normal'}
            </span>
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

        {!isOutside && (
          <>
            <label className={styles.label}>Assigned unit</label>
            {isAssigned ? (
              <>
                <div className={styles.lockedAssign}>
                  🚑 {assignedName}{responder?.responder_type ? ` — ${responder.responder_type}` : ''}
                </div>
                <p className={styles.lockHint}>
                  This unit stays assigned. You can change status, but you cannot switch ambulance/responder.
                </p>
              </>
            ) : (
              <>
                <select
                  className={styles.select}
                  value={responderId}
                  onChange={(e) => setResponderId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">— Choose responder / ambulance —</option>
                  {availableResponders.map((r) => (
                    <option key={r.responder_id} value={r.responder_id}>
                      {r.first_name} {r.last_name} — {r.responder_type}
                    </option>
                  ))}
                </select>
                {availableResponders.length === 0 && (
                  <p className={styles.lockHint}>
                    All units are on another call. They will appear again after that accident is Resolved.
                  </p>
                )}
                {!responderId && (
                  <p className={styles.hint}>
                    Assign a responder first. Status cannot be saved while this accident is unassigned.
                  </p>
                )}
              </>
            )}
          </>
        )}

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
