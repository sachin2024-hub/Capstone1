import { useState } from 'react';
import { getStatusesForIncident, isReferralOnlyIncident, OUTSIDE_STATUS_VALUES, updateIncidentStatus, updateIncidentType } from '../../services/incidentService';
import { INCIDENT_TYPE_GROUPS, matchingTypeNames, matchingSubTypeNames } from '../../constants/incidentTypes';
import { assignResponder } from '../../services/dispatchService';
import { displayIncidentStatus, statusColor } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import { formatIncidentLocation } from '../../utils/locationFormat';
import { isWithinCabadbaran } from '../../utils/geofence';
import ReporterInformationModal from './ReporterInformationModal';
import { userProfilePhotoUrl, resolveMediaUrl } from '../../utils/mediaUrl';
import Icon from '../common/Icon';
import OfflineSentBadge from './OfflineSentBadge';
import IncidentMiniMap from './IncidentMiniMap';
import styles from './IncidentStatusModal.module.css';

// Status preselected in the dropdown when the modal opens or the type changes.
function startingStatus(referralOnly, currentStatus, isOutside) {
  if (referralOnly) {
    if (currentStatus === 'Referred') return 'Referred';
    if (['Dispatch', 'In Progress', 'En Route', 'Arrived'].includes(currentStatus)) {
      return currentStatus;
    }
    return 'Pending';
  }
  return isOutside && currentStatus === 'Pending' ? 'Outside' : displayIncidentStatus(currentStatus);
}

/** Splits "Category — Specific type" into the two dropdown values ('' when not in the list). */
function splitType(type) {
  const [first, ...rest] = String(type || '').split(' — ');
  const group = INCIDENT_TYPE_GROUPS.find((g) => matchingTypeNames(g.category).includes(first));
  if (!group) return { category: '', specific: '' };
  const text = rest.join(' — ');
  const specific = group.options.find((opt) => matchingSubTypeNames(opt).includes(text));
  return { category: group.category, specific: specific || '' };
}

export default function IncidentStatusModal({ incident, responders = [], users = [], onClose, onUpdated, onShowMap, onTypeChanged }) {
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
  const [status, setStatus] = useState(() => startingStatus(referralOnly, currentStatus, isOutside));
  // Category and specific type picked but not saved yet (null = unchanged).
  const [typeDraft, setTypeDraft] = useState(null);
  const [savingType, setSavingType] = useState(false);
  const [typeError, setTypeError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [responderId, setResponderId] = useState(
    assignedResponderId ? String(assignedResponderId) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showReporter, setShowReporter] = useState(false);
  const [viewPhoto, setViewPhoto] = useState('');

  if (!incident) return null;

  const photoUrls = (Array.isArray(incident.photo_urls) ? incident.photo_urls : []).map(resolveMediaUrl);
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
    ? `${responder.vehicle || 'Vehicle'}${responder.team ? ` — ${responder.team}` : ''}`
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

  const typeEditable = !['Archived', 'Deleted'].includes(currentStatus);
  const reportedType = splitType(incident.incident_type);
  const shownType = typeDraft || reportedType;
  const specificOptions =
    INCIDENT_TYPE_GROUPS.find((g) => g.category === shownType.category)?.options || [];
  const newType =
    typeDraft?.category && typeDraft?.specific
      ? `${typeDraft.category} — ${typeDraft.specific}`
      : '';

  // Picking the reported values again counts as no change.
  const pickType = (category, specific) => {
    const unchanged = category === reportedType.category && specific === reportedType.specific;
    setTypeDraft(unchanged ? null : { category, specific });
    setTypeError('');
  };

  // Saved on its own, so a wrong type can be fixed before any unit is assigned.
  const handleSaveType = async () => {
    setSavingType(true);
    setTypeError('');
    try {
      await updateIncidentType(incident.incident_id, newType);
      const nextReferralOnly = isReferralOnlyIncident({ incident_type: newType });
      setStatus(startingStatus(nextReferralOnly, currentStatus, isOutside));
      if (!isAssigned) setResponderId('');
      setError('');
      onTypeChanged?.(newType);
      setTypeDraft(null);
      onUpdated?.();
    } catch (err) {
      setTypeError(err.message || 'Failed to change the type.');
    } finally {
      setSavingType(false);
    }
  };

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
      const message = adminMessage.trim();
      if (status !== statusNow || message) {
        await updateIncidentStatus(incident.incident_id, status, {
          ...(status === 'Cancelled' ? { reason: cancelReason.trim() } : {}),
          ...(message ? { admin_response: message } : {}),
        });
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
    <div className={`${styles.overlay} ${styles.detailsOverlay}`} onClick={onClose}>
      <div className={`${styles.modal} ${styles.detailsModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.headerMeta}>
            <h3 className={styles.modalTitle}>Incident Details</h3>
            <span className={styles.incidentId}>#{incident.incident_id}</span>
            <span className={styles.previewBadge} style={{ background: statusColor(currentStatus) }}>
              {displayIncidentStatus(currentStatus)}
            </span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Two columns so everything fits on screen: details left, actions right. */}
        <div className={styles.detailsBody}>
          <div className={styles.incidentInfo}>
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
            <div className={`${styles.detailCell} ${styles.detailCellFull}`}>
              <span className={styles.detailLabel}>Type</span>
              {typeEditable ? (
                <>
                  {/* Step 1: category. Step 2: the specific types of that category. */}
                  <div className={styles.typeRow}>
                    <select
                      className={styles.typeSelect}
                      value={shownType.category}
                      onChange={(e) => {
                        const category = e.target.value;
                        pickType(category, category === reportedType.category ? reportedType.specific : '');
                      }}
                      disabled={saving || savingType}
                      aria-label="Emergency category"
                      title="Change this if the emergency was reported wrong"
                    >
                      {!shownType.category && <option value="" disabled>— Choose category —</option>}
                      {INCIDENT_TYPE_GROUPS.map((group) => (
                        <option key={group.category} value={group.category}>{group.category}</option>
                      ))}
                    </select>
                    {shownType.category && (
                      <select
                        // Remounts per category so the new list is noticeable.
                        key={shownType.category}
                        className={`${styles.typeSelect} ${styles.typeSelectSpecific}`}
                        value={shownType.specific}
                        onChange={(e) => pickType(shownType.category, e.target.value)}
                        disabled={saving || savingType}
                        aria-label="Specific emergency type"
                      >
                        {!shownType.specific && <option value="" disabled>— Choose type —</option>}
                        {specificOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {/* Older records may hold a type that is not in the lists. */}
                  {!reportedType.specific && (
                    <span className={styles.typeReported}>Reported as: {incident.incident_type || '—'}</span>
                  )}
                </>
              ) : (
                <span className={styles.detailValue}>{incident.incident_type || '—'}</span>
              )}
              {typeDraft && (
                <div className={styles.typeActions}>
                  <button
                    type="button"
                    className={styles.typeSave}
                    onClick={handleSaveType}
                    disabled={savingType || !newType}
                  >
                    {savingType ? 'Saving...' : 'Save type'}
                  </button>
                  <button
                    type="button"
                    className={styles.typeUndo}
                    onClick={() => { setTypeDraft(null); setTypeError(''); }}
                    disabled={savingType}
                  >
                    Undo
                  </button>
                </div>
              )}
              {typeError && <span className={styles.typeError} role="alert">{typeError}</span>}
            </div>
            <div className={`${styles.detailCell} ${styles.detailCellFull} ${styles.mapSlot}`}>
              <span className={styles.detailLabel}>Location</span>
              <span className={styles.detailValue}>{locationText}</span>
              {onShowMap && (
                <IncidentMiniMap
                  lat={loc?.latitude}
                  lng={loc?.longitude}
                  onOpen={() => { onShowMap(incident); onClose(); }}
                />
              )}
            </div>
            {/* The assigned unit is already shown beside the status controls when it can be set. */}
            <div className={styles.detailCell}>
              <span className={styles.detailLabel}>Date</span>
              <span className={styles.detailValue}>{formatDate(incident.date_reported)}</span>
              <OfflineSentBadge incident={incident} />
            </div>
            {!showAssignUnit && (
              <div className={styles.detailCell}>
                <span className={styles.detailLabel}>Assigned</span>
                <span className={styles.detailValue}>
                  {isClosed && !responder ? '—' : assignedName}
                </span>
              </div>
            )}
            <div className={`${styles.detailCell} ${showAssignUnit ? '' : styles.detailCellFull}`}>
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

          <div className={styles.actionColumn}>
            {photoUrls.length > 0 && (
              <div className={`${styles.detailCell} ${styles.photoBlock}`}>
                <span className={styles.detailLabel}>Photos from reporter ({photoUrls.length})</span>
                <div className={styles.photoGrid}>
                  {photoUrls.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      className={styles.photoThumb}
                      onClick={() => setViewPhoto(url)}
                      aria-label={`View accident photo ${i + 1}`}
                    >
                      <img src={url} alt={`Accident photo ${i + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                      <Icon name="ambulance" size={16} /> {assignedName}
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
                      <option value="">— Choose vehicle / team —</option>
                      {availableResponders.map((r) => (
                        <option key={r.responder_id} value={r.responder_id}>
                          {r.vehicle} — {r.team}
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

            <label className={styles.label}>Message to user (optional)</label>
            <textarea
              className={styles.reasonBox}
              value={adminMessage}
              onChange={(e) => setAdminMessage(e.target.value)}
              placeholder="Shown to the user on their phone, e.g. 'Please stay near the gate.'"
              maxLength={300}
              rows={2}
              disabled={saving}
            />
            {incident.admin_response ? (
              <p className={styles.hint}>
                Last message sent: <strong>{incident.admin_response}</strong>
              </p>
            ) : null}

            {selectedHint && (
              <p className={styles.hint}>
                📱 User will see: <strong>{selectedHint}</strong>
              </p>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving || savingType}>
                {saving ? 'Saving...' : '💾 Save Status'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewPhoto && (
        <div
          className={styles.lightbox}
          onClick={(e) => { e.stopPropagation(); setViewPhoto(''); }}
          role="dialog"
          aria-label="Accident photo"
        >
          <img src={viewPhoto} alt="Accident" onClick={(e) => e.stopPropagation()} />
          <button type="button" className={styles.lightboxClose} onClick={() => setViewPhoto('')}>✕</button>
        </div>
      )}

      {showReporter && (
        <ReporterInformationModal
          user={registeredUser}
          onClose={() => setShowReporter(false)}
        />
      )}
    </div>
  );
}
