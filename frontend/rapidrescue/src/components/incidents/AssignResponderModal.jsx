import { useState } from 'react';
import { assignResponder } from '../../services/dispatchService';
import styles from './IncidentStatusModal.module.css';

export default function AssignResponderModal({ incident, responders, onClose, onAssigned }) {
  const dispatch = Array.isArray(incident?.dispatch) ? incident.dispatch[0] : incident?.dispatch;
  const currentResponder = dispatch?.responders;

  const [responderId, setResponderId] = useState(
    currentResponder?.responder_id ? String(currentResponder.responder_id) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!incident) return null;

  const handleSave = async () => {
    if (!responderId) {
      setError('Please select a responder.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await assignResponder(incident.incident_id, Number(responderId));
      onAssigned?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to assign responder.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Assign Responder</h3>
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
          {currentResponder && (
            <p className={styles.responder}>
              Current: 🚑 {currentResponder.first_name} {currentResponder.last_name}
            </p>
          )}
        </div>

        <label className={styles.label}>Select responder / team</label>
        <select
          className={styles.select}
          value={responderId}
          onChange={(e) => setResponderId(e.target.value)}
          disabled={saving}
        >
          <option value="">— Choose responder —</option>
          {responders.map((r) => (
            <option key={r.responder_id} value={r.responder_id}>
              {r.first_name} {r.last_name} — {r.responder_type} ({r.availability_status})
            </option>
          ))}
        </select>

        <p className={styles.hint}>
          📱 Status will update to <strong>In Progress</strong> and the assigned team will be marked as Busy.
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Assigning...' : '🚑 Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
