import { useState } from 'react';
import {
  createDispatchRecord,
  updateDispatchRecord,
} from '../../services/dispatchRecordService';
import styles from './Dispatch.module.css';

const EMPTY = {
  vehicle: '',
  modulation: '',
  team_officer: '',
  on_board: '',
  time_dispatch: '',
  dispatch_kmr_fuel: '',
  time_touchdown: '',
  touchdown_kmr_fuel: '',
};

export default function DispatchRecordModal({ entry, logDate, onClose, onSaved }) {
  const isEdit = Boolean(entry?.dispatch_record_id);
  const [form, setForm] = useState(entry ? { ...EMPTY, ...entry } : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, log_date: logDate };
      if (isEdit) {
        await updateDispatchRecord(entry.dispatch_record_id, payload);
      } else {
        await createDispatchRecord(payload);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save dispatch record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{isEdit ? '✏️ Edit Dispatch Record' : '➕ New Dispatch Record'}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGrid}>
            <label>
              Vehicle
              <input value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)} placeholder="Ambulance 1" />
            </label>
            <label>
              Destination
              <input value={form.modulation} onChange={(e) => set('modulation', e.target.value)} placeholder="Hospital / destination" />
            </label>
            <label>
              T.O
              <input value={form.team_officer} onChange={(e) => set('team_officer', e.target.value)} />
            </label>
            <label>
              On-Board
              <input value={form.on_board} onChange={(e) => set('on_board', e.target.value)} />
            </label>
            <label>
              Time Dispatch
              <input type="time" value={form.time_dispatch} onChange={(e) => set('time_dispatch', e.target.value)} />
            </label>
            <label>
              Dispatch KMR/Fuel
              <input value={form.dispatch_kmr_fuel} onChange={(e) => set('dispatch_kmr_fuel', e.target.value)} placeholder="km / fuel level" />
            </label>
            <label>
              Time Touchdown
              <input type="time" value={form.time_touchdown} onChange={(e) => set('time_touchdown', e.target.value)} />
            </label>
            <label>
              Touchdown KMR/Fuel
              <input value={form.touchdown_kmr_fuel} onChange={(e) => set('touchdown_kmr_fuel', e.target.value)} placeholder="km / fuel level" />
            </label>
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
