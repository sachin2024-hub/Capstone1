import { useEffect, useState } from 'react';
import {
  createResponder,
  updateResponder,
  RESPONDER_TEAMS,
  AVAILABILITY_STATUSES,
} from '../../services/responderService';
import styles from './ResponderModal.module.css';

function formFromResponder(responder) {
  if (!responder) {
    return {
      vehicle: '',
      contact_number: '',
      team: 'Alpha 1',
      availability_status: 'Available',
    };
  }
  return {
    vehicle: responder.vehicle || '',
    contact_number: responder.contact_number || '',
    team: responder.team || 'Alpha 1',
    availability_status: responder.availability_status || 'Available',
  };
}

export default function ResponderModal({ responder, onClose, onSaved }) {
  const isEdit = Boolean(responder?.responder_id);
  const [form, setForm] = useState(() => formFromResponder(responder));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(formFromResponder(responder));
    setError('');
  }, [responder]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const vehicle = form.vehicle.trim();
    if (!vehicle) {
      setError('Vehicle name is required.');
      return;
    }
    if (!form.team) {
      setError('Team is required.');
      return;
    }
    const contact = form.contact_number.trim();
    if (contact && !/^\d{7,15}$/.test(contact)) {
      setError('Contact number must be 7–15 digits.');
      return;
    }
    if (!form.availability_status) {
      setError('Availability status is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        vehicle,
        team: form.team,
        contact_number: contact || null,
        availability_status: form.availability_status,
      };

      if (isEdit) {
        await updateResponder(responder.responder_id, payload);
      } else {
        await createResponder(payload);
      }

      await onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save responder.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>
            {isEdit ? 'Edit Vehicle' : 'Add Vehicle'}
          </h3>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Vehicle *</label>
            <input
              className={styles.input}
              name="vehicle"
              value={form.vehicle}
              onChange={handleChange}
              disabled={saving}
              placeholder="e.g. Ambulance 1"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Contact Number</label>
            <input
              className={styles.input}
              name="contact_number"
              value={form.contact_number}
              onChange={handleChange}
              disabled={saving}
              placeholder="09XXXXXXXXX"
              inputMode="numeric"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Team *</label>
              <select
                className={styles.select}
                name="team"
                value={form.team}
                onChange={handleChange}
                disabled={saving}
              >
                {RESPONDER_TEAMS.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Availability Status *</label>
              <select
                className={styles.select}
                name="availability_status"
                value={form.availability_status}
                onChange={handleChange}
                disabled={saving}
              >
                {AVAILABILITY_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          <p className={styles.hint}>
            Choose <strong>Available</strong>, <strong>Busy</strong>, or <strong>Off Duty</strong>, then click <strong>Save Changes</strong>.
            The table status updates to match what you save.
          </p>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
