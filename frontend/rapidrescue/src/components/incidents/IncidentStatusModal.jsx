import { useState } from 'react';
import { getStatusesForIncident, isReferralOnlyIncident, OUTSIDE_STATUS_VALUES, updateIncidentStatus } from '../../services/incidentService';
import { assignResponder } from '../../services/dispatchService';
import { displayIncidentStatus, statusColor } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import { formatIncidentLocation } from '../../utils/locationFormat';
import { isWithinCabadbaran } from '../../utils/geofence';
import ReporterInformationModal from './ReporterInformationModal';
import { userProfilePhotoUrl } from '../../utils/mediaUrl';
import Icon from '../common/Icon';
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
  const referralOnly = isReferralOnlyIncident(incident);
  const availableStatuses = getStatusesForIncident(incident, currentStatus, isOutside);
  const [status, setStatus] = useState(() => {
    if (referralOnly) {
      if (currentStatus === 'Referred') return 'Referred';
      if (['Dispatch', 'In Progress', 'En Route', 'Arrived'].includes(currentStatus)) {
        return currentStatus;
      }
      return 'Pending';
    }
    return isOutside && currentStatus === 'Pending'
      ? 'Outside'
      : displayIncidentStatus(currentStatus);
  });
  const [cancelReason, setCancelReason] = useState('');
  const [responderId, setResponderId] = useState(
    assignedResponderId ? String(assignedResponderId) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showReporter, setShowReporter] = useState(false);

  if (!incident) return null;

  const locationText = formatIncidentLocation(loc);
  const nestedUser = Array.isArray(incident.users) ? incident.users[0] : (incident.users || incident.user);
  const matchedUser = (users || []).find(
    (u) => Number(u.user_id) === Number(incident.user_id)
  ) || nestedUser;
  const registeredUser = matchedUser
    ? { ...matchedUser, user_id: matchedUser.user_id || incident.user_id }
    : (incident.user_id ? { user_id: incident.user_id } : null);
  const reporterName = registeredUser
    ? `${registeredUser.first_name || ''} ${registeredUser.last_name || ''}`.trim() || '—'
    : '—';
  const reporterPhone = registeredUser?.phone_number || '';
  const reporterPhoto = userProfilePhotoUrl(registeredUser);
  const assignedName = responder
    ? `${responder.first_name} ${responder.last_name}`
    : 'Unassigned';
  const selectedHint = availableStatuses.find((s) => s.value === status)?.hint;
  const existingCancelReason = String(incident.incident_description || '').match(/\[Cancelled(?: by reporter)?\]\s*([\s\S]+)$/i)?.[1]?.trim() || '';
  const isClosed =
    ['Cancelled', 'Resolved', 'Completed', 'Archived'].includes(currentStatus) ||
    ['Cancelled', 'Resolved', 'Completed', 'Archived'].includes(status);
  const showAssignUnit = !referralOnly && !isOutside && !isClosed;
  const availableResponders = (responders || []).filter((r) => {
    const isCurrent = assignedResponderId && Number(r.responder_id) === Number(assignedResponderId);
    if (isCurrent) return true;
    if (r.occupied) return false;
    return String(r.availability_status || '').toLowerCase() === 'available';
  });

  const handleSave = async () => {
    if (showAssignUnit && !isAssigned && !responderId) {
      setError('Assign a responder first before saving the status.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      let statusNow = currentStatus;
      if (!isOutside && !isAssigned && responderId) {
        await assignResponder(incident.incident_id, Number(responderId));
        if (statusNow === 'Pending') statusNow = 'Dispatch';
      }
      if (status === 'Cancelled' && !cancelReason.trim()) {
        setError('Please enter why this incident is being cancelled.');
        setSaving(false);
        return;
      }
      if (status !== statusNow) {
        await updateIncidentStatus(
          incident.incident_id,
          status,
          status === 'Cancelled' ? { reason: cancelReason.trim() } : {}
        );
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
            <button
              type="button"
              className={styles.reporterTrigger}
              onClick={() => setShowReporter(true)}
              aria-label="View reporter information"
              title="View reporter information"
            >
              {reporterPhoto ? (
                <img
                  src={reporterPhoto}
                  alt=""
                  className={styles.reporterAvatarImg}
                />
              ) : (
                <span className={styles.reporterAvatar} aria-hidden="true">
                  {(registeredUser?.first_name || '?').charAt(0).toUpperCase()}
                </span>
              )}
              <span className={styles.reporterTriggerMeta}>
                <span className={styles.reporterTriggerName}>{reporterName}</span>
                {registeredUser?.user_id ? (
                  <span className={styles.reporterTriggerId}>#{registeredUser.user_id}</span>
                ) : null}
              </span>
            </button>
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
            <span className={styles.detailValue}>
              {isClosed && !responder ? '—' : assignedName}
            </span>
          </div>
          <div className={styles.detailCell}>
            <span className={styles.detailLabel}>Status</span>
            <span
              className={styles.previewBadge}
              style={{ background: statusColor(currentStatus) }}
            >
              {displayIncidentStatus(currentStatus)}
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
          {existingCancelReason ? (
            <div className={`${styles.detailCell} ${styles.detailCellFull}`}>
              <span className={styles.detailLabel}>Cancel reason</span>
              <span className={styles.detailValue}>{existingCancelReason}</span>
            </div>
          ) : null}
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

        {showAssignUnit && (
          <>
            <label className={styles.label}>Assigned unit</label>
            {isAssigned ? (
              <>
                <div className={styles.lockedAssign}>
                  <Icon name="ambulance" size={16} /> {assignedName}{responder?.responder_type ? ` — ${responder.responder_type}` : ''}
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

        {status === 'Cancelled' && (
          <>
            <label className={styles.label}>Reason for cancellation</label>
            <textarea
              className={styles.reasonBox}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why is this incident being cancelled?"
              maxLength={300}
              rows={3}
              disabled={saving}
            />
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
            style={{ background: statusColor(status) }}
          >
            {displayIncidentStatus(status)}
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

      {showReporter && (
        <ReporterInformationModal
          user={registeredUser}
          onClose={() => setShowReporter(false)}
        />
      )}
    </div>
  );
}
