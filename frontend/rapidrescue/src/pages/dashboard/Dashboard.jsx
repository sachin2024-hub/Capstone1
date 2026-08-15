import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, getStoredAdmin } from '../../services/authService';
import api from '../../services/api';
import ConfirmModal from '../../components/common/ConfirmModal';
import LiveMap from '../../components/map/LiveMap';
import IncidentStatusModal from '../../components/incidents/IncidentStatusModal';
import AssignResponderModal from '../../components/incidents/AssignResponderModal';
import ResponderModal from '../../components/responders/ResponderModal';
import CallLogPage from '../../components/calllog/CallLogPage';
import DispatchPage from '../../components/dispatch/DispatchPage';
import { archiveIncident, restoreIncident, deleteIncident, permanentDeleteIncident } from '../../services/incidentService';
import { deleteResponder } from '../../services/responderService';
import { fetchDispatchRecords, deleteDispatchRecord } from '../../services/dispatchRecordService';
import { fetchCallLogs, deleteCallLog } from '../../services/callLogService';
import { STATUS_COLORS } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import { parseLocationAddress, formatAreaLabel } from '../../utils/locationFormat';
import { APP_IMAGES } from '../../constants/images';
import { INCIDENT_TYPE_GROUPS } from '../../constants/incidentTypes';
import styles from './Dashboard.module.css';

const ONGOING_STATUSES = ['Pending', 'In Progress', 'En Route', 'Arrived'];
const ACTIVE_RESPONSE_STATUSES = ['In Progress', 'En Route', 'Arrived'];

function formatLocation(loc) {
  if (!loc) return '—';
  const parsed = parseLocationAddress(loc.location_address);
  if (parsed.purok || parsed.barangay) {
    const parts = [
      formatAreaLabel(parsed) !== 'GPS location' ? formatAreaLabel(parsed) : null,
      parsed.barangay ? `Brgy. ${parsed.barangay}` : null,
      parsed.city || null,
    ].filter(Boolean);
    return parts.join(', ') || parsed.display;
  }
  return parsed.display || `${loc.latitude?.toFixed(4)}, ${loc.longitude?.toFixed(4)}`;
}

function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const NAV_SECTIONS = [
  {
    label: 'Main Menu',
    items: [
      { id: 'dashboard', icon: '📊', label: 'Dashboard' },
      { id: 'incidents', icon: '🚨', label: 'Accident' },
      { id: 'live-map', icon: '🗺️', label: 'Live Map' },
      { id: 'archive', icon: '📁', label: 'Archive' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'responders', icon: '🚑', label: 'Responders' },
      { id: 'dispatch', icon: '📡', label: 'Dispatch' },
      { id: 'call-log', icon: '📋', label: 'Call Log' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'users', icon: '👥', label: 'Users' },
      { id: 'settings', icon: '⚙️', label: 'Settings' },
    ],
  },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

const STAT_COLORS = ['statRed', 'statOrange', 'statBlue', 'statYellow', 'statGreen', 'statPurple'];

const INCIDENT_FILTER_TABS = [
  { id: 'pending', icon: '⏳', label: 'Pending' },
  { id: 'active', icon: '🚑', label: 'Active Response' },
  { id: 'resolved', icon: '✅', label: 'Resolved' },
  { id: 'cancelled', icon: '❌', label: 'Cancelled' },
];

const ARCHIVE_MODULE_TABS = [
  { id: 'accident', icon: '🚨', label: 'Accident' },
  { id: 'dispatch', icon: '📡', label: 'Dispatch' },
  { id: 'call-log', icon: '📋', label: 'Call Log' },
];

const DISPATCH_ARCHIVE_COLUMNS = [
  { key: 'dispatch_record_id', label: 'ID', render: (row) => <strong>#{row.dispatch_record_id}</strong> },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'modulation', label: 'Modulation' },
  { key: 'team_officer', label: 'T.O' },
  { key: 'time_dispatch', label: 'Time Dispatch' },
  { key: 'log_date', label: 'Date' },
];

const CALL_LOG_ARCHIVE_COLUMNS = [
  { key: 'call_log_id', label: 'ID', render: (row) => <strong>#{row.call_log_id}</strong> },
  { key: 'caller_name', label: 'Caller' },
  { key: 'time_of_call', label: 'Time' },
  { key: 'nature_of_incident', label: 'Nature', compact: true },
  { key: 'team', label: 'Team' },
  { key: 'log_date', label: 'Date' },
];

function dispatchRecordSearchText(row) {
  return [
    row.dispatch_record_id,
    row.vehicle,
    row.modulation,
    row.team_officer,
    row.on_board,
    row.log_date,
  ].filter(Boolean).join(' ');
}

function callLogSearchText(row) {
  return [
    row.call_log_id,
    row.caller_name,
    row.nature_of_incident,
    row.patient_name,
    row.team,
    row.log_date,
  ].filter(Boolean).join(' ');
}

function getAssignedResponder(inc) {
  const dispatch = Array.isArray(inc.dispatch) ? inc.dispatch[0] : inc.dispatch;
  return dispatch?.responders || null;
}

function hasIncidentLocation(inc) {
  const loc = Array.isArray(inc.locations) ? inc.locations[0] : inc.locations;
  return Boolean(loc?.latitude && loc?.longitude);
}

const INCIDENT_PAGE_SIZE = 8;

function incidentSearchText(inc) {
  const loc = Array.isArray(inc.locations) ? inc.locations[0] : inc.locations;
  const assigned = getAssignedResponder(inc);
  return [
    inc.incident_id,
    inc.incident_type,
    inc.incident_description,
    inc.incident_status,
    inc.priority_level,
    inc.users?.first_name,
    inc.users?.last_name,
    loc?.address,
    assigned?.first_name,
    assigned?.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesIncidentType(inc, categoryFilter, subFilter) {
  if (!categoryFilter) return true;
  const t = inc.incident_type || '';
  if (subFilter) {
    return t === `${categoryFilter} — ${subFilter}` || t.includes(subFilter);
  }
  return t === categoryFilter || t.startsWith(`${categoryFilter} —`) || t.startsWith(categoryFilter);
}

function IncidentTableSection({
  title,
  icon,
  rows,
  isLoading,
  emptyMessage,
  onEdit,
  onArchive,
  onDelete,
  onPermanentDelete,
  onRestore,
  onAssign,
  onShowMap,
  showAssignActions = false,
  actions = {},
  hideTitle = false,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onBulkRestore,
  onBulkDelete,
  bulkDeleteLabel = 'Delete',
}) {
  const {
    edit = true,
    archive = false,
    delete: showDelete = true,
    permanentDelete = false,
    restore = false,
  } = actions;
  const hasActions = edit || archive || showDelete || permanentDelete || restore || showAssignActions || onShowMap;
  const selectedSet = selectedIds || new Set();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subFilter, setSubFilter] = useState('');
  const [page, setPage] = useState(1);

  const subOptions = INCIDENT_TYPE_GROUPS.find((g) => g.category === categoryFilter)?.options || [];

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((inc) => {
      if (!matchesIncidentType(inc, categoryFilter, subFilter)) return false;
      if (q && !incidentSearchText(inc).includes(q)) return false;
      return true;
    });
  }, [rows, search, categoryFilter, subFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / INCIDENT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice(
    (currentPage - 1) * INCIDENT_PAGE_SIZE,
    currentPage * INCIDENT_PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, subFilter, rows]);

  const filteredIds = filteredRows.map((inc) => inc.incident_id);
  const selectedCount = filteredIds.filter((id) => selectedSet.has(id)).length;
  const allFilteredSelected = filteredIds.length > 0 && selectedCount === filteredIds.length;
  const colCount = 9 + (selectable ? 1 : 0) + (hasActions ? 1 : 0);

  return (
    <div className={styles.incidentSection}>
      {!hideTitle && (
        <h3 className={styles.incidentSectionTitle}>
          <span>{icon} {title}</span>
          <span className={styles.incidentCount}>{rows.length}</span>
        </h3>
      )}
      <div className={styles.tableCard}>
        {selectable && (
          <div className={styles.archiveBulkBar}>
            <label className={styles.archiveSelectAll}>
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={() => onToggleSelectAll?.(filteredIds)}
              />
              Select All
            </label>
            {restore && (
              <button
                type="button"
                className={styles.restoreBtn}
                disabled={selectedCount === 0}
                onClick={() => onBulkRestore?.(filteredIds.filter((id) => selectedSet.has(id)))}
              >
                Restore
              </button>
            )}
            {(showDelete || permanentDelete) && (
              <button
                type="button"
                className={styles.deleteBtn}
                disabled={selectedCount === 0}
                onClick={() => onBulkDelete?.(filteredIds.filter((id) => selectedSet.has(id)))}
              >
                {bulkDeleteLabel}
              </button>
            )}
            {selectedCount > 0 && (
              <span className={styles.archiveSelectedCount}>{selectedCount} selected</span>
            )}
          </div>
        )}
        <div className={styles.incidentToolbar}>
          <input
            type="search"
            className={styles.incidentSearch}
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={styles.incidentTypeFilter}
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setSubFilter('');
            }}
          >
            <option value="">All types</option>
            {INCIDENT_TYPE_GROUPS.map((group) => (
              <option key={group.category} value={group.category}>{group.category}</option>
            ))}
          </select>
          {categoryFilter && (
            <select
              className={styles.incidentTypeFilter}
              value={subFilter}
              onChange={(e) => setSubFilter(e.target.value)}
            >
              <option value="">All {categoryFilter}</option>
              {subOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
        {isLoading ? (
          <div className={styles.loadingBox}>
            <div className={styles.loader} />
            <span>Loading data...</span>
          </div>
        ) : (
          <div className={`${styles.tableWrapper} ${styles.incidentTableWrapper}`}>
            <table className={`${styles.table} ${styles.incidentTable}`}>
              <thead>
                <tr>
                  {selectable && (
                    <th className={styles.checkCell}>
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={() => onToggleSelectAll?.(filteredIds)}
                        title="Select all"
                      />
                    </th>
                  )}
                  <th>ID</th><th>Type</th><th>Description</th><th>Reporter</th>
                  <th>Location</th><th>Assigned</th><th>Status</th><th>Priority</th><th>Date</th>
                  {hasActions && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((inc) => {
                  const loc = Array.isArray(inc.locations) ? inc.locations[0] : inc.locations;
                  const assigned = getAssignedResponder(inc);
                  return (
                    <tr
                      key={inc.incident_id}
                      className={onEdit ? styles.incidentRowClickable : undefined}
                      onClick={onEdit ? () => onEdit(inc) : undefined}
                    >
                      {selectable && (
                        <td className={styles.checkCell} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedSet.has(inc.incident_id)}
                            onChange={() => onToggleSelect?.(inc.incident_id)}
                          />
                        </td>
                      )}
                      <td><strong>#{inc.incident_id}</strong></td>
                      <td className={styles.compactCell}>{inc.incident_type}</td>
                      <td className={styles.descCell}>{inc.incident_description || '—'}</td>
                      <td>
                        {inc.users
                          ? `${inc.users.first_name} ${inc.users.last_name}`
                          : <span style={{ color: '#bbb' }}>—</span>}
                      </td>
                      <td className={styles.descCell} style={{ color: '#888', fontSize: 12 }}>
                        {formatLocation(loc)}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {assigned ? (
                          <span className={styles.assignedBadge}>
                            🚑 {assigned.first_name} {assigned.last_name}
                          </span>
                        ) : (
                          <span style={{ color: '#bbb' }}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={styles.statusBadge}
                          style={{ background: STATUS_COLORS[inc.incident_status] || '#9E9E9E' }}
                        >
                          <span className={styles.statusDotBadge} />
                          {inc.incident_status}
                        </span>
                      </td>
                      <td>{inc.priority_level || 'Normal'}</td>
                      <td style={{ color: '#888', fontSize: 12 }}>{formatDate(inc.date_reported)}</td>
                      {hasActions && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className={styles.actionGroup}>
                            {onShowMap && (
                              <button
                                type="button"
                                className={`${styles.mapBtn} ${styles.actionIconBtn}`}
                                onClick={() => onShowMap(inc)}
                                disabled={!hasIncidentLocation(inc)}
                                title={hasIncidentLocation(inc) ? 'Open on Live Map' : 'No GPS location'}
                              >
                                🗺️
                              </button>
                            )}
                            {showAssignActions && onAssign && (
                              <button
                                type="button"
                                className={`${styles.assignBtn} ${styles.actionIconBtn}`}
                                onClick={() => onAssign(inc)}
                                title="Assign responder"
                              >
                                🚑
                              </button>
                            )}
                            {edit && (
                              <button
                                type="button"
                                className={`${styles.editBtn} ${styles.actionIconBtn}`}
                                onClick={() => onEdit(inc)}
                                title="Edit"
                              >
                                ✏️
                              </button>
                            )}
                            {archive && (
                              <button
                                type="button"
                                className={`${styles.archiveBtn} ${styles.actionIconBtn}`}
                                onClick={() => onArchive(inc)}
                                title="Archive"
                              >
                                📁
                              </button>
                            )}
                            {restore && (
                              <button
                                type="button"
                                className={`${styles.restoreBtn} ${styles.actionIconBtn}`}
                                onClick={() => onRestore(inc)}
                                title="Restore"
                              >
                                ↩️
                              </button>
                            )}
                            {showDelete && (
                              <button
                                type="button"
                                className={`${styles.deleteBtn} ${styles.actionIconBtn}`}
                                onClick={() => onDelete(inc)}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            )}
                            {permanentDelete && (
                              <button
                                type="button"
                                className={`${styles.deleteBtn} ${styles.actionIconBtn}`}
                                onClick={() => onPermanentDelete(inc)}
                                title="Remove forever"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {pagedRows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className={styles.emptyRow}>
                      {rows.length === 0 ? emptyMessage : '📭 No incidents match your search or filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && filteredRows.length > 0 && (
          <div className={styles.paginationBar}>
            <span className={styles.paginationInfo}>
              Showing {(currentPage - 1) * INCIDENT_PAGE_SIZE + 1}–
              {Math.min(currentPage * INCIDENT_PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </span>
            <div className={styles.paginationBtns}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className={styles.pageNum}>Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ARCHIVE_RECORD_PAGE_SIZE = 8;

function ArchiveRecordsTable({
  rows,
  columns,
  idKey,
  isLoading,
  emptyMessage,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onRestore,
  onDelete,
  searchPlaceholder,
  getSearchText,
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const selectedSet = selectedIds || new Set();

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => (getSearchText?.(row) || '').toLowerCase().includes(q));
  }, [rows, search, getSearchText]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ARCHIVE_RECORD_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice(
    (currentPage - 1) * ARCHIVE_RECORD_PAGE_SIZE,
    currentPage * ARCHIVE_RECORD_PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [search, rows]);

  const filteredIds = filteredRows.map((row) => row[idKey]);
  const selectedCount = filteredIds.filter((id) => selectedSet.has(id)).length;
  const allFilteredSelected = filteredIds.length > 0 && selectedCount === filteredIds.length;
  const colCount = columns.length + 2;

  return (
    <div className={styles.incidentSection}>
      <div className={styles.tableCard}>
        <div className={styles.archiveBulkBar}>
          <label className={styles.archiveSelectAll}>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={() => onToggleSelectAll?.(filteredIds)}
            />
            Select All
          </label>
          {onRestore && (
            <button
              type="button"
              className={styles.restoreBtn}
              disabled={selectedCount === 0}
              onClick={() => onRestore(filteredIds.filter((id) => selectedSet.has(id)))}
            >
              Restore
            </button>
          )}
          <button
            type="button"
            className={styles.deleteBtn}
            disabled={selectedCount === 0}
            onClick={() => onDelete(filteredIds.filter((id) => selectedSet.has(id)))}
          >
            Delete
          </button>
          {selectedCount > 0 && (
            <span className={styles.archiveSelectedCount}>{selectedCount} selected</span>
          )}
        </div>
        <div className={styles.incidentToolbar}>
          <input
            type="search"
            className={styles.incidentSearch}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isLoading ? (
          <div className={styles.loadingBox}>
            <div className={styles.loader} />
            <span>Loading data...</span>
          </div>
        ) : (
          <div className={`${styles.tableWrapper} ${styles.incidentTableWrapper}`}>
            <table className={`${styles.table} ${styles.incidentTable}`}>
              <thead>
                <tr>
                  <th className={styles.checkCell}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={() => onToggleSelectAll?.(filteredIds)}
                      title="Select all"
                    />
                  </th>
                  {columns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row[idKey]}>
                    <td className={styles.checkCell}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row[idKey])}
                        onChange={() => onToggleSelect?.(row[idKey])}
                      />
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className={col.compact ? styles.compactCell : undefined}>
                        {col.render ? col.render(row) : (row[col.key] || '—')}
                      </td>
                    ))}
                    <td>
                      <div className={styles.actionGroup}>
                        {onRestore && (
                          <button
                            type="button"
                            className={`${styles.restoreBtn} ${styles.actionIconBtn}`}
                            onClick={() => onRestore([row[idKey]])}
                            title="Restore"
                          >
                            ↩️
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${styles.deleteBtn} ${styles.actionIconBtn}`}
                          onClick={() => onDelete([row[idKey]])}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagedRows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className={styles.emptyRow}>
                      {rows.length === 0 ? emptyMessage : '📭 No records match your search.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && filteredRows.length > 0 && (
          <div className={styles.paginationBar}>
            <span className={styles.paginationInfo}>
              Showing {(currentPage - 1) * ARCHIVE_RECORD_PAGE_SIZE + 1}–
              {Math.min(currentPage * ARCHIVE_RECORD_PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </span>
            <div className={styles.paginationBtns}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className={styles.pageNum}>Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = getStoredAdmin();
  const clock = useClock();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [stats, setStats] = useState({
    users: 0, incidents: 0, pending: 0, resolved: 0,
    responders: 0, available: 0, dispatch: 0,
  });
  const [incidents, setIncidents] = useState([]);
  const [users, setUsers] = useState([]);
  const [responders, setResponders] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingIncident, setEditingIncident] = useState(null);
  const [assigningIncident, setAssigningIncident] = useState(null);
  const [liveMapFocusId, setLiveMapFocusId] = useState(null);
  const [responderModal, setResponderModal] = useState(null);
  const [incidentFilter, setIncidentFilter] = useState('pending');
  const [archiveModule, setArchiveModule] = useState('accident');
  const [archiveSelectedIds, setArchiveSelectedIds] = useState(() => new Set());
  const [archiveDispatchRows, setArchiveDispatchRows] = useState([]);
  const [archiveCallLogs, setArchiveCallLogs] = useState([]);
  const [archiveRecordsLoading, setArchiveRecordsLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const fetchData = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setIsLoading(true);
      setError('');
    }
    try {
      const [usersRes, incidentsRes, respondersRes, dispatchRes] = await Promise.all([
        api.get('/auth/users'),
        api.get('/incidents/all'),
        api.get('/responders'),
        api.get('/dispatch/all'),
      ]);

      const usersData      = usersRes.data;
      const incidentsData  = incidentsRes.data;
      const respondersData = respondersRes.data;
      const dispatchData   = dispatchRes.data;

      setUsers(usersData);
      setIncidents(incidentsData);
      setResponders(respondersData);
      setDispatches(dispatchData);
      setStats({
        users:      usersData.length,
        incidents:  incidentsData.length,
        pending:    incidentsData.filter((i) => i.incident_status === 'Pending').length,
        resolved:   incidentsData.filter((i) => i.incident_status === 'Resolved').length,
        responders: respondersData.length,
        available:  respondersData.filter((r) => r.availability_status === 'Available').length,
        dispatch:   dispatchData.length,
      });
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load data.');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData({ showLoader: true });
    const interval = setInterval(() => fetchData(), 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const fetchArchiveRecords = useCallback(async () => {
    setArchiveRecordsLoading(true);
    try {
      const [dispatchRows, callLogs] = await Promise.all([
        fetchDispatchRecords(),
        fetchCallLogs(),
      ]);
      setArchiveDispatchRows(dispatchRows || []);
      setArchiveCallLogs(callLogs || []);
    } catch (err) {
      setError(err.message || 'Failed to load archive records.');
    } finally {
      setArchiveRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'archive') return undefined;
    fetchArchiveRecords();
    return undefined;
  }, [activeTab, fetchArchiveRecords]);

  useEffect(() => {
    setArchiveSelectedIds(new Set());
  }, [archiveModule]);

  const handleLogout = () => {
    if (!window.confirm('Are you sure you want to log out?')) return;
    logout();
    navigate('/login');
  };

  const handleShowOnLiveMap = (inc) => {
    setLiveMapFocusId(inc.incident_id);
    setActiveTab('live-map');
  };

  const pendingIncidents = incidents.filter((i) => i.incident_status === 'Pending');
  const activeResponseIncidents = incidents.filter((i) => ACTIVE_RESPONSE_STATUSES.includes(i.incident_status));
  const resolvedIncidents = incidents.filter((i) => i.incident_status === 'Resolved');
  const cancelledIncidents = incidents.filter((i) => i.incident_status === 'Cancelled');
  const archivedIncidents = incidents.filter((i) => i.incident_status === 'Archived');
  const deletedIncidents = incidents.filter((i) => i.incident_status === 'Deleted');
  const archiveAccidentRows = [...archivedIncidents, ...deletedIncidents];
  const ongoingIncidents = incidents.filter((i) => ONGOING_STATUSES.includes(i.incident_status));

  const incidentFilterCounts = {
    pending: pendingIncidents.length,
    active: activeResponseIncidents.length,
    resolved: resolvedIncidents.length,
    cancelled: cancelledIncidents.length,
  };

  const archiveModuleCounts = {
    accident: archivedIncidents.length + deletedIncidents.length,
    dispatch: archiveDispatchRows.length,
    'call-log': archiveCallLogs.length,
  };

  const toggleArchiveSelect = (id) => {
    setArchiveSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleArchiveSelectAll = (ids) => {
    setArchiveSelectedIds((prev) => {
      const allOn = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allOn) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  };

  const openConfirm = (config) => setConfirmModal(config);
  const closeConfirm = () => setConfirmModal(null);

  const goToRestoredAccident = (status) => {
    setActiveTab('incidents');
    if (status === 'Resolved') setIncidentFilter('resolved');
    else if (status === 'Cancelled') setIncidentFilter('cancelled');
    else if (ACTIVE_RESPONSE_STATUSES.includes(status)) setIncidentFilter('active');
    else setIncidentFilter('pending');
  };

  const handleArchive = async (inc) => {
    if (!window.confirm(`Archive incident #${inc.incident_id}? It will move to the Archive tab.`)) return;
    try {
      await archiveIncident(inc.incident_id);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to archive incident.');
    }
  };

  const handleDelete = (inc) => {
    openConfirm({
      title: 'Delete accident?',
      message: `Move accident #${inc.incident_id} to Archive? You can restore it later.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        closeConfirm();
        try {
          await deleteIncident(inc.incident_id);
          await fetchData();
          setActiveTab('archive');
          setArchiveModule('accident');
        } catch (err) {
          setError(err.message || 'Failed to delete incident.');
        }
      },
    });
  };

  const handlePermanentDelete = (inc) => {
    openConfirm({
      title: 'Delete permanently?',
      message: `Permanently remove accident #${inc.incident_id}? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        closeConfirm();
        try {
          if (inc.incident_status !== 'Deleted') {
            await deleteIncident(inc.incident_id);
          }
          await permanentDeleteIncident(inc.incident_id);
          await fetchData();
        } catch (err) {
          setError(err.message || 'Failed to permanently remove incident.');
        }
      },
    });
  };

  const handleRestore = async (inc) => {
    try {
      const result = await restoreIncident(inc.incident_id);
      const nextStatus = result?.incident?.incident_status || 'Pending';
      await fetchData();
      goToRestoredAccident(nextStatus);
    } catch (err) {
      setError(err.message || 'Failed to restore incident.');
      await fetchData();
    }
  };

  const handleBulkRestoreIncidents = async (ids) => {
    if (!ids?.length) return;
    try {
      const results = await Promise.all(ids.map((id) => restoreIncident(id)));
      setArchiveSelectedIds(new Set());
      await fetchData();
      const nextStatus = results[0]?.incident?.incident_status || 'Pending';
      goToRestoredAccident(nextStatus);
    } catch (err) {
      setError(err.message || 'Failed to restore selected accidents.');
      await fetchData();
    }
  };

  const handleBulkDeleteIncidents = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Delete accidents?',
      message: `Permanently delete ${ids.length} selected accident(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        closeConfirm();
        try {
          const selected = archiveAccidentRows.filter((inc) => ids.includes(inc.incident_id));
          await Promise.all(selected.map(async (inc) => {
            if (inc.incident_status !== 'Deleted') {
              await deleteIncident(inc.incident_id);
            }
            await permanentDeleteIncident(inc.incident_id);
          }));
          setArchiveSelectedIds(new Set());
          await fetchData();
        } catch (err) {
          setError(err.message || 'Failed to delete selected accidents.');
        }
      },
    });
  };

  const handleBulkDeleteDispatch = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Delete dispatch records?',
      message: `Permanently delete ${ids.length} dispatch record(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(ids.map((id) => deleteDispatchRecord(id)));
          setArchiveSelectedIds(new Set());
          await fetchArchiveRecords();
        } catch (err) {
          setError(err.message || 'Failed to delete dispatch records.');
        }
      },
    });
  };

  const handleBulkDeleteCallLogs = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Delete call logs?',
      message: `Permanently delete ${ids.length} call log(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(ids.map((id) => deleteCallLog(id)));
          setArchiveSelectedIds(new Set());
          await fetchArchiveRecords();
        } catch (err) {
          setError(err.message || 'Failed to delete call logs.');
        }
      },
    });
  };

  const handleDeleteResponder = async (r) => {
    if (!window.confirm(`Delete ${r.first_name} ${r.last_name}? This cannot be undone.`)) return;
    try {
      await deleteResponder(r.responder_id);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to delete responder.');
    }
  };

  const fullName  = user ? `${user.first_name} ${user.last_name}` : 'Admin';
  const initial   = user ? user.first_name?.charAt(0).toUpperCase() : 'A';
  const adminRole = user?.role || 'Admin';

  const clockStr = clock.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const dateStr  = clock.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

  const statCards = [
    { label: 'Users',       value: stats.users,      icon: '👥', color: STAT_COLORS[0] },
    { label: 'Incidents',   value: stats.incidents,   icon: '🚨', color: STAT_COLORS[1] },
    { label: 'Responders',  value: stats.responders,  icon: '🚑', color: STAT_COLORS[2] },
    { label: 'Pending',     value: stats.pending,     icon: '⏳', color: STAT_COLORS[3] },
    { label: 'Available',   value: stats.available,   icon: '✅', color: STAT_COLORS[4] },
    { label: 'Dispatches',  value: stats.dispatch,    icon: '📡', color: STAT_COLORS[5] },
  ];

  const TableLoader = () => (
    <div className={styles.loadingBox}>
      <div className={styles.loader} />
      <span>Loading data...</span>
    </div>
  );

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab);

  return (
    <div className={styles.wrapper}>
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>
            <img src={APP_IMAGES.logo} alt="" className={styles.sidebarLogoImg} />
          </div>
          {sidebarOpen && (
            <div className={styles.sidebarBrand}>
              <span className={styles.sidebarAppName}>RapidRescue</span>
              <span className={styles.sidebarTagline}>Emergency Dispatch</span>
            </div>
          )}
        </div>

        <nav className={styles.nav}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className={styles.navSection}>
              {sidebarOpen && (
                <p className={styles.navSectionLabel}>{section.label}</p>
              )}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${activeTab === item.id ? styles.navItemActive : ''}`}
                  onClick={() => setActiveTab(item.id)}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {sidebarOpen && <span className={styles.navLabel}>{item.label}</span>}
                  {sidebarOpen && item.id === 'incidents' && stats.pending > 0 && (
                    <span className={styles.navBadge}>{stats.pending}</span>
                  )}
                  {sidebarOpen && item.id === 'archive' && (archivedIncidents.length + deletedIncidents.length) > 0 && (
                    <span className={styles.navBadge}>{archivedIncidents.length + deletedIncidents.length}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
            title={!sidebarOpen ? 'Log Out' : undefined}
          >
            <span className={styles.navIcon}>↪</span>
            {sidebarOpen && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <button className={styles.toggleBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>

          <div className={styles.topbarLeft}>
          <div className={styles.topbarTitle}>
              {currentNav?.icon} {currentNav?.label}
            </div>
            {activeTab !== 'live-map' && (
              <div className={styles.liveBadge}>
                <span className={styles.liveDot} />
                LIVE
              </div>
            )}
          </div>

          <div className={styles.topbarRight}>
            <span className={styles.topbarClock}>
              {clockStr} · {dateStr}
            </span>
            <button className={styles.notifBtn} title="Pending alerts">
              🔔
              {stats.pending > 0 && (
                <span className={styles.notifCount}>{stats.pending}</span>
              )}
            </button>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>{initial}</div>
            <div>
              <span className={styles.userName}>{fullName}</span>
              <span className={styles.userRole}>{adminRole}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className={`${styles.content} ${(activeTab === 'live-map' || activeTab === 'call-log' || activeTab === 'dispatch') ? styles.contentPanel : ''}`}>
          {error && (
            <div className={styles.errorBanner}>
              <span>⚠️ {error}</span>
              <button onClick={() => fetchData({ showLoader: true })} className={styles.retryBtn}>🔄 Retry</button>
            </div>
          )}

          {/* ── OVERVIEW ────────────────────────────────── */}
          {activeTab === 'dashboard' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Dashboard</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>
                  🔄 Refresh
                </button>
              </div>

              {/* Banner */}
              <div className={styles.overviewBanner}>
                <img src={APP_IMAGES.ambulances[1]} alt="" className={styles.bannerImage} aria-hidden="true" />
                <div className={styles.bannerText}>
                  <h3>🚨 Cabadbaran City Emergency System</h3>
                  <p>Monitoring all incidents, responders, and dispatches in real-time · Auto-refresh every 15s</p>
                </div>
                <div className={styles.bannerActions}>
                  <button className={styles.bannerBtn} onClick={() => setActiveTab('live-map')}>🗺️ Live Map</button>
                  <button className={styles.bannerBtn} onClick={() => setActiveTab('incidents')}>🚨 Incidents</button>
                </div>
                  </div>

              {/* Stats */}
              <div className={styles.statsGrid}>
                {statCards.map((card) => (
                  <div key={card.label} className={`${styles.statCard} ${styles[card.color]}`}>
                    <div className={styles.statIconBox}>
                      <span>{card.icon}</span>
                </div>
                  <div className={styles.statBody}>
                      <div className={styles.statValue}>{isLoading ? '—' : card.value}</div>
                      <div className={styles.statLabel}>{card.label}</div>
                      {card.label === 'Pending' && !isLoading && card.value > 0 && (
                        <div className={`${styles.statTrend} ${styles.trendWarn}`}>⚠️ Needs attention</div>
                      )}
                      {card.label === 'Available' && !isLoading && (
                        <div className={`${styles.statTrend} ${styles.trendUp}`}>● Ready to respond</div>
                      )}
                </div>
                  </div>
                ))}
              </div>

              {/* Recent Incidents */}
              <div className={styles.tableCard}>
                <div className={styles.tableCardHeader}>
                  <h3 className={styles.tableTitle}>🚨 Recent Incidents</h3>
                  <button className={styles.viewAllBtn} onClick={() => setActiveTab('incidents')}>
                    View All →
                  </button>
                </div>
                {isLoading ? <TableLoader /> : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>ID</th><th>Type</th><th>Reporter</th>
                          <th>Status</th><th>Priority</th><th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.slice(0, 6).map((inc) => (
                          <tr key={inc.incident_id}>
                            <td><strong>#{inc.incident_id}</strong></td>
                            <td>{inc.incident_type}</td>
                            <td>
                              {inc.users
                                ? `${inc.users.first_name} ${inc.users.last_name}`
                                : <span style={{ color: '#bbb' }}>—</span>}
                            </td>
                            <td>
                              <span
                                className={styles.statusBadge}
                                style={{ background: STATUS_COLORS[inc.incident_status] || '#9E9E9E' }}
                              >
                                <span className={styles.statusDotBadge} />
                                {inc.incident_status}
                              </span>
                            </td>
                            <td>{inc.priority_level || 'Normal'}</td>
                            <td style={{ color: '#888', fontSize: 12 }}>{formatDate(inc.date_reported)}</td>
                          </tr>
                        ))}
                        {incidents.length === 0 && (
                          <tr><td colSpan={6} className={styles.emptyRow}>📭 No incidents yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── LIVE MAP ─────────────────────────────────── */}
          {activeTab === 'live-map' && (
            <LiveMap key="live-map" focusIncidentId={liveMapFocusId} />
          )}

          {/* ── INCIDENTS ────────────────────────────────── */}
          {activeTab === 'incidents' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Accident</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
              </div>

              <div className={styles.incidentFilterBar}>
                {INCIDENT_FILTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.incidentFilterBtn} ${incidentFilter === tab.id ? styles.incidentFilterBtnActive : ''}`}
                    onClick={() => setIncidentFilter(tab.id)}
                  >
                    <span>{tab.icon} {tab.label}</span>
                    <span className={styles.incidentFilterBadge}>{incidentFilterCounts[tab.id]}</span>
                  </button>
                ))}
              </div>

              <p className={styles.archiveHint}>
                {incidentFilter === 'resolved'
                  ? 'Resolved incidents stay here until you manually move them to Archive.'
                  : incidentFilter === 'cancelled'
                    ? 'Cancelled incidents can be archived or deleted from here.'
                    : 'Click the buttons above to switch between incident groups.'}
              </p>

              {incidentFilter === 'pending' && (
                <IncidentTableSection
                  title="Pending"
                  icon="⏳"
                  rows={pendingIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No pending incidents."
                  onEdit={setEditingIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onAssign={setAssigningIncident}
                  onShowMap={handleShowOnLiveMap}
                  showAssignActions
                  hideTitle
                />
              )}

              {incidentFilter === 'active' && (
                <IncidentTableSection
                  title="Active Response"
                  icon="🚑"
                  rows={activeResponseIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No incidents in progress."
                  onEdit={setEditingIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onAssign={setAssigningIncident}
                  onShowMap={handleShowOnLiveMap}
                  showAssignActions
                  hideTitle
                />
              )}

              {incidentFilter === 'resolved' && (
                <IncidentTableSection
                  title="Resolved"
                  icon="✅"
                  rows={resolvedIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No resolved incidents yet."
                  onEdit={setEditingIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onShowMap={handleShowOnLiveMap}
                  showAssignActions={false}
                  actions={{ edit: true, archive: true, delete: true }}
                  hideTitle
                />
              )}

              {incidentFilter === 'cancelled' && (
                <IncidentTableSection
                  title="Cancelled"
                  icon="❌"
                  rows={cancelledIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No cancelled incidents."
                  onEdit={setEditingIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onShowMap={handleShowOnLiveMap}
                  showAssignActions={false}
                  actions={{ edit: true, archive: true, delete: true }}
                  hideTitle
                />
              )}
            </div>
          )}

          {/* ── ARCHIVE ──────────────────────────────────── */}
          {activeTab === 'archive' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Archive</h2>
                <button
                  className={styles.refreshBtn}
                  onClick={() => {
                    fetchData();
                    fetchArchiveRecords();
                  }}
                >
                  🔄 Refresh
                </button>
              </div>

              <div className={styles.incidentFilterBar}>
                {ARCHIVE_MODULE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.incidentFilterBtn} ${archiveModule === tab.id ? styles.incidentFilterBtnActive : ''}`}
                    onClick={() => setArchiveModule(tab.id)}
                  >
                    <span>{tab.icon} {tab.label}</span>
                    <span className={styles.incidentFilterBadge}>{archiveModuleCounts[tab.id]}</span>
                  </button>
                ))}
              </div>

              {archiveModule === 'accident' && (
                <>
                  <p className={styles.archiveHint}>
                    Click Restore to send an accident back to the Accident page immediately. Delete asks for confirmation first.
                  </p>
                  <IncidentTableSection
                    title="Accidents"
                    icon="🚨"
                    rows={archiveAccidentRows}
                    isLoading={isLoading}
                    emptyMessage="📭 No archived accidents yet."
                    onEdit={setEditingIncident}
                    onArchive={handleArchive}
                    onDelete={handlePermanentDelete}
                    onRestore={handleRestore}
                    onPermanentDelete={handlePermanentDelete}
                    actions={{ edit: false, archive: false, delete: false, permanentDelete: true, restore: true }}
                    hideTitle
                    selectable
                    selectedIds={archiveSelectedIds}
                    onToggleSelect={toggleArchiveSelect}
                    onToggleSelectAll={toggleArchiveSelectAll}
                    onBulkRestore={handleBulkRestoreIncidents}
                    onBulkDelete={handleBulkDeleteIncidents}
                    bulkDeleteLabel="Delete"
                  />
                </>
              )}

              {archiveModule === 'dispatch' && (
                <>
                  <p className={styles.archiveHint}>
                    All dispatch records. Use Select All and Delete to remove records permanently.
                  </p>
                  <ArchiveRecordsTable
                    rows={archiveDispatchRows}
                    columns={DISPATCH_ARCHIVE_COLUMNS}
                    idKey="dispatch_record_id"
                    isLoading={archiveRecordsLoading}
                    emptyMessage="📭 No dispatch records yet."
                    selectedIds={archiveSelectedIds}
                    onToggleSelect={toggleArchiveSelect}
                    onToggleSelectAll={toggleArchiveSelectAll}
                    onDelete={handleBulkDeleteDispatch}
                    searchPlaceholder="Search dispatch records..."
                    getSearchText={dispatchRecordSearchText}
                  />
                </>
              )}

              {archiveModule === 'call-log' && (
                <>
                  <p className={styles.archiveHint}>
                    All call logs. Use Select All and Delete to remove entries permanently.
                  </p>
                  <ArchiveRecordsTable
                    rows={archiveCallLogs}
                    columns={CALL_LOG_ARCHIVE_COLUMNS}
                    idKey="call_log_id"
                    isLoading={archiveRecordsLoading}
                    emptyMessage="📭 No call logs yet."
                    selectedIds={archiveSelectedIds}
                    onToggleSelect={toggleArchiveSelect}
                    onToggleSelectAll={toggleArchiveSelectAll}
                    onDelete={handleBulkDeleteCallLogs}
                    searchPlaceholder="Search call logs..."
                    getSearchText={callLogSearchText}
                  />
                </>
              )}
            </div>
          )}

          {/* ── SETTINGS ───────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Settings</h2>
              </div>
              <div className={styles.settingsGrid}>
                <div className={styles.settingsCard}>
                  <h3 className={styles.settingsCardTitle}>👤 Admin Profile</h3>
                  <div className={styles.settingsRow}>
                    <span>Name</span>
                    <strong>{fullName}</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Email</span>
                    <strong>{user?.email || '—'}</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Role</span>
                    <strong>{adminRole}</strong>
                  </div>
                </div>
                <div className={styles.settingsCard}>
                  <h3 className={styles.settingsCardTitle}>ℹ️ System Info</h3>
                  <div className={styles.settingsRow}>
                    <span>App</span>
                    <strong>RapidRescue Admin</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Version</span>
                    <strong>1.0.0</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>City</span>
                    <strong>Cabadbaran City, Agusan del Norte</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Agency</span>
                    <strong>DRRMO</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Auto-refresh</span>
                    <strong>Every 15 seconds</strong>
                  </div>
                </div>
                <div className={styles.settingsCard}>
                  <h3 className={styles.settingsCardTitle}>📊 Quick Stats</h3>
                  <div className={styles.settingsRow}>
                    <span>Ongoing Incidents</span>
                    <strong>{ongoingIncidents.length}</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Resolved (not archived)</span>
                    <strong>{resolvedIncidents.length}</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Archived Incidents</span>
                    <strong>{archivedIncidents.length}</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Deleted Incidents</span>
                    <strong>{deletedIncidents.length}</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Total Users</span>
                    <strong>{stats.users}</strong>
                  </div>
                  <div className={styles.settingsRow}>
                    <span>Responders</span>
                    <strong>{stats.responders}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── RESPONDERS ───────────────────────────────── */}
          {activeTab === 'responders' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Responders</h2>
                <div className={styles.tabHeaderActions}>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => setResponderModal({ mode: 'add' })}
                  >
                    ➕ Add Dispatcher
                  </button>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
                </div>
              </div>
              <div className={styles.tableCard}>
                {isLoading ? <TableLoader /> : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>ID</th><th>Name</th><th>Type</th><th>Contact</th>
                          <th>Status</th><th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {responders.map((r) => (
                          <tr key={r.responder_id}>
                            <td><strong>#{r.responder_id}</strong></td>
                            <td>
                              <div className={styles.userCell}>
                                <div className={styles.userAvatar}>{r.first_name?.charAt(0)}</div>
                                <span className={styles.userName2}>{r.first_name} {r.last_name}</span>
                              </div>
                            </td>
                            <td>{r.responder_type}</td>
                            <td style={{ color: '#888' }}>{r.contact_number || '—'}</td>
                            <td>
                              <span
                                className={`${styles.statusBadge} ${
                                  r.availability_status === 'Available' ? styles.statusActive : styles.statusBusy
                                }`}
                              >
                                <span className={styles.statusDotBadge} />
                                {r.availability_status}
                              </span>
                            </td>
                            <td>
                              <div className={styles.actionGroup}>
                                <button
                                  type="button"
                                  className={styles.editBtn}
                                  onClick={() => setResponderModal({ mode: 'edit', responder: r })}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  className={styles.deleteBtn}
                                  onClick={() => handleDeleteResponder(r)}
                                >
                                  🗑️ Delete
                                </button>
                              <button
                                  type="button"
                                className={styles.smallBtn}
                                onClick={() => setActiveTab('live-map')}
                              >
                                  🗺️ Map
                              </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {responders.length === 0 && (
                          <tr><td colSpan={6} className={styles.emptyRow}>📭 No responders yet. Click &quot;Add Dispatcher&quot; to create one.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── DISPATCH ─────────────────────────────────── */}
          {activeTab === 'dispatch' && <DispatchPage />}

          {/* ── CALL LOG ─────────────────────────────────── */}
          {activeTab === 'call-log' && <CallLogPage />}

          {/* ── USERS ────────────────────────────────────── */}
          {activeTab === 'users' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Registered Users</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
              </div>
              <div className={styles.tableCard}>
                {isLoading ? <TableLoader /> : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>ID</th><th>Name</th><th>Email</th><th>Phone</th>
                          <th>Address</th><th>Status</th><th>Registered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.user_id}>
                            <td><strong>#{u.user_id}</strong></td>
                            <td>
                              <div className={styles.userCell}>
                                <div className={styles.userAvatar}>{u.first_name?.charAt(0).toUpperCase()}</div>
                                <span className={styles.userName2}>{u.first_name} {u.last_name}</span>
                              </div>
                            </td>
                            <td style={{ color: '#555' }}>{u.email}</td>
                            <td style={{ color: '#888' }}>{u.phone_number || '—'}</td>
                            <td className={styles.descCell} style={{ color: '#888' }}>{u.address || '—'}</td>
                            <td>
                              <span
                                className={`${styles.statusBadge} ${
                                  u.account_status === 'Active' ? styles.statusActive : styles.statusInactive
                                }`}
                              >
                                <span className={styles.statusDotBadge} />
                                {u.account_status}
                              </span>
                            </td>
                            <td style={{ color: '#888', fontSize: 12 }}>{formatDate(u.date_registered)}</td>
                          </tr>
                        ))}
                        {users.length === 0 && (
                          <tr><td colSpan={7} className={styles.emptyRow}>📭 No users registered yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {editingIncident && (
        <IncidentStatusModal
          incident={editingIncident}
          onClose={() => setEditingIncident(null)}
          onUpdated={fetchData}
        />
      )}

      {assigningIncident && (
        <AssignResponderModal
          incident={assigningIncident}
          responders={responders}
          onClose={() => setAssigningIncident(null)}
          onAssigned={fetchData}
        />
      )}
      {responderModal && (
        <ResponderModal
          responder={responderModal.mode === 'edit' ? responderModal.responder : null}
          onClose={() => setResponderModal(null)}
          onSaved={fetchData}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel || 'Delete'}
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={confirmModal.onConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}
