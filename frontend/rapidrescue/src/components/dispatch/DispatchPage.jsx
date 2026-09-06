import { useState, useEffect, useCallback } from 'react';
import {
  fetchDispatchRecords,
  deleteDispatchRecord,
} from '../../services/dispatchRecordService';
import DispatchRecordModal from './DispatchRecordModal';
import ConfirmModal from '../common/ConfirmModal';
import RecordDetailsModal from '../common/RecordDetailsModal';
import styles from './Dispatch.module.css';

const RECORD_COLUMNS = [
  { key: 'vehicle', label: 'VEHICLE' },
  { key: 'modulation', label: 'DESTINATION' },
  { key: 'team_officer', label: 'T.O' },
  { key: 'on_board', label: 'ON-BOARD' },
  { key: 'time_dispatch', label: 'TIME-DISPATCH' },
  { key: 'dispatch_kmr_fuel', label: 'DISPATCH KMR/FUEL' },
  { key: 'time_touchdown', label: 'TIME TOUCHDOWN' },
  { key: 'touchdown_kmr_fuel', label: 'TOUCHDOWN KMR/FUEL' },
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

function renderCell(row, key) {
  if (key === 'time_dispatch' || key === 'time_touchdown') {
    return formatTime(row[key]);
  }
  return row[key] ?? '—';
}

export default function DispatchPage({ onArchived }) {
  const [logDate, setLogDate] = useState(todayStr);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalEntry, setModalEntry] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewing, setViewing] = useState(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchDispatchRecords({ date: logDate });
      setRecords(data);
    } catch (err) {
      setError(err.message || 'Failed to load dispatch records.');
    } finally {
      setLoading(false);
    }
  }, [logDate]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleAdd = () => {
    setModalEntry(null);
    setShowModal(true);
  };

  const handleEdit = (entry) => {
    setModalEntry(entry);
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDispatchRecord(confirmDelete.dispatch_record_id);
      setConfirmDelete(null);
      await loadRecords();
      onArchived?.();
    } catch (err) {
      setError(err.message || 'Failed to delete record.');
      setConfirmDelete(null);
    }
  };

  const dateLabel = new Date(`${logDate}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <label className={styles.filterLabel}>
            DATE
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className={styles.dateInput}
            />
          </label>
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.refreshBtn} onClick={loadRecords}>🔄 Refresh</button>
          <button type="button" className={styles.addBtn} onClick={handleAdd}>➕ Add Dispatch</button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          ⚠️ {error}
          {error.includes('does not exist') && (
            <span> — Run backend/sql/dispatch_records.sql in Supabase SQL Editor.</span>
          )}
        </div>
      )}

      <div className={styles.sheet}>
          <div className={styles.sheetHeader}>
            <h2 className={styles.sheetTitle}>VEHICLE DISPATCH</h2>
            <span className={styles.sheetDate}>DATE: <strong>{dateLabel}</strong></span>
          </div>

          <div className={styles.tableScroll}>
            {loading ? (
              <div className={styles.loadingBox}>Loading dispatch records...</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.rowNum}>#</th>
                    {RECORD_COLUMNS.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                    <th className={styles.actionCol}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row, idx) => (
                    <tr
                      key={row.dispatch_record_id}
                      className={styles.clickableRow}
                      onClick={() => setViewing(row)}
                    >
                      <td className={styles.rowNum}>{idx + 1}</td>
                      {RECORD_COLUMNS.map((col) => (
                        <td key={col.key}>{renderCell(row, col.key)}</td>
                      ))}
                      <td className={styles.actionCol} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.actionGroup}>
                          <button type="button" className={styles.editBtn} onClick={() => handleEdit(row)} title="Edit">✏️</button>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => setConfirmDelete(row)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={RECORD_COLUMNS.length + 2} className={styles.emptyRow}>
                        📋 No dispatch records yet. Click &quot;Add Dispatch&quot; to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.sheetFooter}>
            <span>CDRRMO — Vehicle Dispatch Sheet</span>
            <span className={styles.entryCount}>{records.length} record{records.length === 1 ? '' : 's'}</span>
          </div>
        </div>

      {viewing && (
        <RecordDetailsModal
          title={`Dispatch Details — ${viewing.vehicle || 'Vehicle'}`}
          fields={[
            { label: 'Date', value: viewing.log_date || logDate },
            ...RECORD_COLUMNS.map((col) => ({
              label: col.label,
              value: renderCell(viewing, col.key),
            })),
          ]}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const entry = viewing;
            setViewing(null);
            handleEdit(entry);
          }}
        />
      )}
      {showModal && (
        <DispatchRecordModal
          entry={modalEntry}
          logDate={logDate}
          onClose={() => setShowModal(false)}
          onSaved={loadRecords}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Dispatch Record?"
          message={`Move the dispatch record for ${confirmDelete.vehicle || 'this vehicle'} to Archive? You can restore it later.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
