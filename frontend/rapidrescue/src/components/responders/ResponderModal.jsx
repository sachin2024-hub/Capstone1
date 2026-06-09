import { useState } from 'react';
import {
  createResponder,
  updateResponder,
  RESPONDER_TYPES,
  AVAILABILITY_STATUSES,
} from '../../services/responderService';
import styles from './ResponderModal.module.css';

const EMPTY_FORM = {
  first_name: '',
  middle_name: '',
  last_name: '',
  contact_number: '',
  responder_type: 'Dispatcher',
  availability_status: 'Available',
};

export default function ResponderModal({ responder, onClose, onSaved }) {
  const isEdit = Boolean(responder?.responder_id);
  const [form, setForm] = useState(
    responder
      ? {
          first_name: responder.first_name || '',
          middle_name: responder.middle_name || '',
          last_name: responder.last_name || '',
          contact_number: responder.contact_number || '',
          responder_type: responder.responder_type || 'Dispatcher',
          availability_status: responder.availability_status || 'Available',
        }
      : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required.');
      return;
    }
    if (!form.responder_type) {
      setError('Responder type is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim(),
        contact_number: form.contact_number.trim() || null,
        responder_type: form.responder_type,
        availability_status: form.availability_status,
      };

      if (isEdit) {
        await updateResponder(responder.responder_id, payload);
      } else {
        await createResponder(payload);
      }

      onSaved?.();
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
            {isEdit ? 'Edit Responder' : 'Add Responder / Dispatcher'}
          </h3>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>First Name *</label>
              <input
                className={styles.input}
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                disabled={saving}
                placeholder="e.g. Juan"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Last Name *</label>
              <input
                className={styles.input}
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                disabled={saving}
                placeholder="e.g. Reyes"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Middle Name</label>
            <input
              className={styles.input}
              name="middle_name"
              value={form.middle_name}
              onChange={handleChange}
              disabled={saving}
              placeholder="Optional"
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
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Type *</label>
              <select
                className={styles.select}
                name="responder_type"
                value={form.responder_type}
                onChange={handleChange}
                disabled={saving}
              >
                {RESPONDER_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Status</label>
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

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Responder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
