import { useState, useEffect, useCallback } from 'react';
import {
  fetchCallLogs,
  deleteCallLog,
  CALL_LOG_TEAMS,
} from '../../services/callLogService';
import CallLogModal from './CallLogModal';
import ConfirmModal from '../common/ConfirmModal';
import styles from './CallLog.module.css';

const COLUMNS = [
  { key: 'caller_name', label: 'CALLER NAME' },
  { key: 'time_of_call', label: 'TIME OF CALL' },
  { key: 'cp_number', label: 'CP #' },
  { key: 'nature_of_incident', label: 'NATURE OF INCIDENT / CONCERN' },
  { key: 'chief_complaint', label: 'CHIEF COMPLAINT / INJURIES' },
  { key: 'abc_status', label: 'A.B.C.' },
  { key: 'type_of_code', label: 'TYPE OF CODE' },
  { key: 'number_of_patients', label: 'NO. OF PATIENTS' },
  { key: 'involve_vehicle', label: 'INVOLVE VEHICLE' },
  { key: 'location_landmark', label: 'LOCATION & LANDMARK' },
  { key: 'hazards', label: 'HAZARDS' },
  { key: 'origin', label: 'ORIGIN' },
  { key: 'destination', label: 'DESTINATION' },
  { key: 'patient_name', label: 'PATIENT NAME' },
  { key: 'age', label: 'AGE' },
  { key: 'address', label: 'ADDRESS' },
  { key: 'contact_no', label: 'CONTACT NO.' },
  { key: 'ambulance_no', label: 'AMBULANCE #' },
  { key: 'remarks', label: 'REMARKS' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(t) {
  if (!t) return '—';
  try {
    const [h, m] = t.split(':');
    const hour = Number(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  } catch {
    return t;
  }
}

export default function CallLogPage() {
  const [logDate, setLogDate] = useState(todayStr);
  const [team, setTeam] = useState('ALPHA');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalEntry, setModalEntry] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const teamInfo = CALL_LOG_TEAMS.find((t) => t.id === team) || CALL_LOG_TEAMS[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCallLogs({ date: logDate, team });
      setEntries(data);
    } catch (err) {
      setError(err.message || 'Failed to load call log.');
    } finally {
      setLoading(false);
    }
  }, [logDate, team]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = () => {
    setModalEntry(null);
    setShowModal(true);
  };

  const handleEdit = (entry) => {
    setModalEntry(entry);
    setShowModal(true);
  };

  const handleDelete = (entry) => {
    setConfirmDelete(entry);
  };

  const confirmDeleteEntry = async () => {
    if (!confirmDelete) return;
    try {
      await deleteCallLog(confirmDelete.call_log_id);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete.');
      setConfirmDelete(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <label className={styles.filterLabel}>
            DATE
            <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className={styles.dateInput} />
          </label>
          <div className={styles.teamTabs}>
            {CALL_LOG_TEAMS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles.teamBtn} ${team === t.id ? styles.teamBtnActive : ''}`}
                onClick={() => setTeam(t.id)}
              >
                {t.label}
                <span className={styles.teamHours}>{t.hours}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.refreshBtn} onClick={load}>🔄 Refresh</button>
          <button type="button" className={styles.addBtn} onClick={handleAdd}>➕ Add Entry</button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          ⚠️ {error}
          {error.includes('does not exist') && (
            <span className={styles.errorHint}> — Run backend/sql/call_logs_alter.sql in Supabase SQL Editor.</span>
          )}
        </div>
      )}

      <div className={styles.sheet}>
        <div className={styles.sheetHeader}>
          <div className={styles.sheetTitleBlock}>
            <h1 className={styles.sheetTitle}>CALL LOG</h1>
            <p className={styles.sheetOrg}>CABADBARAN CENTRAL COMMAND AND COMMUNICATION CENTER</p>
          </div>
          <div className={styles.sheetMeta}>
            <div className={styles.sheetTeam}>
              TEAM: <strong>{team}</strong> ({teamInfo.hours})
            </div>
            <div className={styles.sheetDate}>
              DATE: <strong>{new Date(logDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
            </div>
          </div>
        </div>

        <div className={styles.tableScroll}>
          {loading ? (
            <div className={styles.loadingBox}>Loading call log...</div>
          ) : (
            <table className={styles.callTable}>
              <thead>
                <tr>
                  <th className={styles.rowNum}>#</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                  <th className={styles.actionCol}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row, idx) => (
                  <tr key={row.call_log_id}>
                    <td className={styles.rowNum}>{idx + 1}</td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className={styles.cell}>
                        {col.key === 'time_of_call'
                          ? formatTime(row[col.key])
                          : (row[col.key] ?? '—')}
                      </td>
                    ))}
                    <td className={styles.actionCol}>
                      <div className={styles.actionGroup}>
                        <button type="button" className={styles.editBtn} onClick={() => handleEdit(row)} title="Edit">
                          ✏️
                        </button>
                        <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(row)} title="Delete">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length + 2} className={styles.emptyRow}>
                      📋 No entries yet. Click &quot;Add Entry&quot; to log a call.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.sheetFooter}>
          <div className={styles.footerTeams}>
            {CALL_LOG_TEAMS.map((t) => (
              <span key={t.id} className={team === t.id ? styles.footerTeamActive : ''}>
                {t.supervisor} — TEAM {t.id}
              </span>
            ))}
          </div>
          <span className={styles.entryCount}>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</span>
        </div>
      </div>

      {showModal && (
        <CallLogModal
          entry={modalEntry}
          logDate={logDate}
          team={team}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Delete call log?"
          message={`Delete call log entry for ${confirmDelete.caller_name || 'this caller'}? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={confirmDeleteEntry}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
