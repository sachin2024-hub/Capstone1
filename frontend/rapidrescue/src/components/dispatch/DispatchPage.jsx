import { useState, useEffect, useCallback } from 'react';
import {
  fetchDispatchRecords,
  deleteDispatchRecord,
  fetchDispatchLog,
} from '../../services/dispatchRecordService';
import { DISPATCH_COLORS } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import DispatchRecordModal from './DispatchRecordModal';
import ConfirmModal from '../common/ConfirmModal';
import RecordDetailsModal from '../common/RecordDetailsModal';
import styles from './Dispatch.module.css';

const RECORD_COLUMNS = [
  { key: 'vehicle', label: 'VEHICLE' },
  { key: 'modulation', label: 'MODULATION' },
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
  const [view, setView] = useState('records');
  const [logDate, setLogDate] = useState(todayStr);
  const [records, setRecords] = useState([]);
  const [dispatchLog, setDispatchLog] = useState([]);
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

  const loadDispatchLog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchDispatchLog();
      setDispatchLog(data);
    } catch (err) {
      setError(err.message || 'Failed to load dispatch log.');
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (view === 'records') await loadRecords();
    else await loadDispatchLog();
  }, [view, loadRecords, loadDispatchLog]);

  useEffect(() => {
    load();
  }, [load]);

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
          <div className={styles.tabBar}>
            <button
              type="button"
              className={`${styles.tabBtn} ${view === 'records' ? styles.tabBtnActive : ''}`}
              onClick={() => setView('records')}
            >
              🚑 Dispatch
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${view === 'log' ? styles.tabBtnActive : ''}`}
              onClick={() => setView('log')}
            >
              📋 Dispatch Log
            </button>
          </div>
          {view === 'records' && (
            <label className={styles.filterLabel}>
              DATE
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className={styles.dateInput}
              />
            </label>
          )}
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.refreshBtn} onClick={load}>🔄 Refresh</button>
          {view === 'records' && (
            <button type="button" className={styles.addBtn} onClick={handleAdd}>➕ Add Dispatch</button>
          )}
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

      {view === 'records' ? (
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
                      onClick={() => setViewing({ type: 'record', row })}
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
      ) : (
        <div className={styles.sheet}>
          <div className={styles.sheetHeader}>
            <h2 className={styles.sheetTitle}>DISPATCH LOG</h2>
            <span className={styles.sheetDate}>Incident &amp; Responder Assignments</span>
          </div>

          <div className={styles.tableScroll}>
            {loading ? (
              <div className={styles.loadingBox}>Loading dispatch log...</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>INCIDENT</th>
                    <th>RESPONDER</th>
                    <th>STATUS</th>
                    <th>DISPATCH TIME</th>
                    <th>ARRIVAL</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchLog.map((d) => (
                    <tr
                      key={d.dispatch_id}
                      className={styles.clickableRow}
                      onClick={() => setViewing({ type: 'log', row: d })}
                    >
                      <td><strong>#{d.dispatch_id}</strong></td>
                      <td>
                        <strong>#{d.incidents?.incident_id}</strong> — {d.incidents?.incident_type || '—'}
                        {d.incidents?.users && (
                          <span className={styles.subText}>
                            {d.incidents.users.first_name} {d.incidents.users.last_name}
                          </span>
                        )}
                      </td>
                      <td>
                        {d.responders ? (
                          <div className={styles.userCell}>
                            <div className={styles.userAvatar}>{d.responders.first_name?.charAt(0)}</div>
                            <div>
                              <span className={styles.userName2}>
                                {d.responders.first_name} {d.responders.last_name}
                              </span>
                              <span className={styles.subText}>{d.responders.responder_type}</span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#bbb' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={styles.statusBadge}
                          style={{ background: DISPATCH_COLORS[d.dispatch_status] || '#9E9E9E' }}
                        >
                          <span className={styles.statusDotBadge} />
                          {d.dispatch_status}
                        </span>
                      </td>
                      <td style={{ color: '#888', fontSize: 12 }}>{formatDate(d.dispatch_time)}</td>
                      <td style={{ color: '#888', fontSize: 12 }}>{formatDate(d.arrival_time)}</td>
                    </tr>
                  ))}
                  {dispatchLog.length === 0 && (
                    <tr>
                      <td colSpan={6} className={styles.emptyRow}>
                        📭 No dispatches yet. Press SOS on mobile to trigger.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.sheetFooter}>
            <span>CDRRMO — Dispatch Activity Log</span>
            <span className={styles.entryCount}>{dispatchLog.length} entr{dispatchLog.length === 1 ? 'y' : 'ies'}</span>
          </div>
        </div>
      )}

      {viewing?.type === 'record' && (
        <RecordDetailsModal
          title={`Dispatch Details — ${viewing.row.vehicle || 'Vehicle'}`}
          fields={[
            { label: 'Date', value: viewing.row.log_date || logDate },
            ...RECORD_COLUMNS.map((col) => ({
              label: col.label,
              value: renderCell(viewing.row, col.key),
            })),
          ]}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const entry = viewing.row;
            setViewing(null);
            handleEdit(entry);
          }}
        />
      )}
      {viewing?.type === 'log' && (
        <RecordDetailsModal
          title={`Dispatch Log — #${viewing.row.dispatch_id}`}
          fields={[
            { label: 'Incident', value: viewing.row.incidents?.incident_id ? `#${viewing.row.incidents.incident_id}` : '—' },
            { label: 'Type', value: viewing.row.incidents?.incident_type },
            { label: 'Reporter', value: viewing.row.incidents?.users ? `${viewing.row.incidents.users.first_name} ${viewing.row.incidents.users.last_name}` : '—' },
            { label: 'Responder', value: viewing.row.responders ? `${viewing.row.responders.first_name} ${viewing.row.responders.last_name}` : '—' },
            { label: 'Unit type', value: viewing.row.responders?.responder_type },
            { label: 'Status', value: viewing.row.dispatch_status },
            { label: 'Dispatch time', value: formatDate(viewing.row.dispatch_time) },
            { label: 'Arrival', value: formatDate(viewing.row.arrival_time) },
          ]}
          onClose={() => setViewing(null)}
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
