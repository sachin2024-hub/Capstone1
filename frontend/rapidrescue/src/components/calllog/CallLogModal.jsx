import { useState } from 'react';
import { createCallLog, updateCallLog, TYPE_OF_CODE_OPTIONS } from '../../services/callLogService';
import Icon from '../common/Icon';
import styles from './CallLog.module.css';

const EMPTY = {
  caller_name: '',
  time_of_call: '',
  cp_number: '',
  nature_of_incident: '',
  chief_complaint: '',
  abc_status: '',
  type_of_code: '',
  number_of_patients: 1,
  involve_vehicle: '',
  location_landmark: '',
  hazards: '',
  origin: '',
  destination: '',
  patient_name: '',
  age: '',
  address: '',
  contact_no: '',
  ambulance_no: '',
  remarks: '',
};

export default function CallLogModal({ entry, logDate, team, onClose, onSaved }) {
  const isEdit = Boolean(entry?.call_log_id);
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
      const payload = {
        ...form,
        log_date: logDate,
        team,
        number_of_patients: Number(form.number_of_patients) || 1,
      };
      if (isEdit) {
        await updateCallLog(entry.call_log_id, payload);
      } else {
        await createCallLog(payload);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save call log.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{isEdit ? <><Icon name="edit" size={18} /> Edit Call Log Entry</> : <><Icon name="add" size={18} /> New Call Log Entry</>}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGrid}>
            <label>
              Caller Name
              <input value={form.caller_name} onChange={(e) => set('caller_name', e.target.value)} />
            </label>
            <label>
              Time of Call
              <input type="time" value={form.time_of_call} onChange={(e) => set('time_of_call', e.target.value)} />
            </label>
            <label>
              CP #
              <input value={form.cp_number} onChange={(e) => set('cp_number', e.target.value)} placeholder="09XXXXXXXXX" />
            </label>
            <label>
              Type of Code
              <select value={form.type_of_code} onChange={(e) => set('type_of_code', e.target.value)}>
                <option value="">— Select —</option>
                {TYPE_OF_CODE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className={styles.span2}>
              Nature of Incident / Concern
              <input value={form.nature_of_incident} onChange={(e) => set('nature_of_incident', e.target.value)} />
            </label>
            <label className={styles.span2}>
              Chief Complaint / Injuries
              <textarea rows={2} value={form.chief_complaint} onChange={(e) => set('chief_complaint', e.target.value)} />
            </label>
            <label>
              A.B.C.
              <input value={form.abc_status} onChange={(e) => set('abc_status', e.target.value)} placeholder="Airway, Breathing, Circulation" />
            </label>
            <label>
              No. of Patients
              <input type="number" min="1" value={form.number_of_patients} onChange={(e) => set('number_of_patients', e.target.value)} />
            </label>
            <label>
              Involve Vehicle
              <input value={form.involve_vehicle} onChange={(e) => set('involve_vehicle', e.target.value)} />
            </label>
            <label className={styles.span2}>
              Location & Landmark
              <input value={form.location_landmark} onChange={(e) => set('location_landmark', e.target.value)} />
            </label>
            <label className={styles.span2}>
              Hazards
              <input value={form.hazards} onChange={(e) => set('hazards', e.target.value)} />
            </label>
            <label>
              Origin
              <input value={form.origin} onChange={(e) => set('origin', e.target.value)} />
            </label>
            <label>
              Destination
              <input value={form.destination} onChange={(e) => set('destination', e.target.value)} />
            </label>
            <label>
              Patient Name
              <input value={form.patient_name} onChange={(e) => set('patient_name', e.target.value)} />
            </label>
            <label>
              Age
              <input value={form.age} onChange={(e) => set('age', e.target.value)} />
            </label>
            <label className={styles.span2}>
              Address
              <input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </label>
            <label>
              Contact No.
              <input value={form.contact_no} onChange={(e) => set('contact_no', e.target.value)} />
            </label>
            <label>
              Ambulance #
              <input value={form.ambulance_no} onChange={(e) => set('ambulance_no', e.target.value)} />
            </label>
            <label className={styles.spanFull}>
              Remarks
              <textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
            </label>
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update Entry' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
