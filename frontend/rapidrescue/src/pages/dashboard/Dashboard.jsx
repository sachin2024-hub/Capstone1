import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, getStoredAdmin } from '../../services/authService';
import api from '../../services/api';
import { logAdminLogout } from '../../services/activityLogService';
import ActivityLogsPage from '../../components/logs/ActivityLogsPage';
import ConfirmModal from '../../components/common/ConfirmModal';
import RecordDetailsModal from '../../components/common/RecordDetailsModal';
import LiveMap from '../../components/map/LiveMap';
import IncidentStatusModal from '../../components/incidents/IncidentStatusModal';
import AccidentReport from '../../components/incidents/AccidentReport';
import AssignResponderModal from '../../components/incidents/AssignResponderModal';
import ResponderModal from '../../components/responders/ResponderModal';
import CallLogPage from '../../components/calllog/CallLogPage';
import DispatchPage from '../../components/dispatch/DispatchPage';
import { archiveIncident, restoreIncident, deleteIncident, permanentDeleteIncident, updateIncidentStatus, getStatusesForIncident, OUTSIDE_STATUS_VALUES } from '../../services/incidentService';
import { deleteResponder } from '../../services/responderService';
import { fetchDispatchRecords, restoreDispatchRecord, permanentDeleteDispatchRecord } from '../../services/dispatchRecordService';
import { fetchCallLogs, restoreCallLog, permanentDeleteCallLog } from '../../services/callLogService';
import { STATUS_COLORS, displayIncidentStatus, statusColor } from '../../constants/statusColors';
import { BLOCK_REASONS } from '../../constants/blockReasons';
import { formatDate } from '../../utils/formatDate';
import { formatIncidentLocation } from '../../utils/locationFormat';
import { isWithinCabadbaran } from '../../utils/geofence';
import { rememberIncidentStatus, peekIncidentStatus, takeIncidentStatus } from '../../utils/restoreMemory';
import { APP_IMAGES } from '../../constants/images';
import { INCIDENT_TYPE_GROUPS, matchingTypeNames, matchingSubTypeNames } from '../../constants/incidentTypes';
import styles from './Dashboard.module.css';

const ONGOING_STATUSES = ['Pending', 'Dispatch', 'In Progress', 'En Route', 'Arrived'];
const ACTIVE_RESPONSE_STATUSES = ['Dispatch', 'In Progress', 'En Route', 'Arrived'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function makeDateFilter(overrides = {}) {
  const now = new Date();
  return {
    mode: 'all',
    month: now.getMonth(),
    year: now.getFullYear(),
    date: null,
    ...overrides,
  };
}

function padDatePart(n) {
  return String(n).padStart(2, '0');
}

function sameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function collectFilterYears(...lists) {
  const current = new Date().getFullYear();
  const years = new Set();
  for (let year = current - 7; year <= current + 1; year += 1) years.add(year);
  lists.flat().forEach((row) => {
    const raw = row?.date_reported || row?.dispatch_time || row?.created_at;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
  });
  return [...years].sort((a, b) => b - a);
}

function calendarCells(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  return cells;
}

function matchesIncidentDateRange(inc, filter) {
  if (!filter || filter.mode === 'all') return true;
  const reported = new Date(inc.date_reported);
  if (Number.isNaN(reported.getTime())) return false;
  const now = new Date();

  if (filter.mode === 'date' && filter.date) {
    const picked = new Date(`${filter.date}T00:00:00`);
    return !Number.isNaN(picked.getTime()) && sameCalendarDay(reported, picked);
  }
  if (filter.mode === 'day') return sameCalendarDay(reported, now);
  if (filter.mode === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekday = start.getDay();
    start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));
    return reported >= start && reported <= now;
  }
  if (filter.mode === 'month') {
    return reported.getFullYear() === filter.year && reported.getMonth() === filter.month;
  }
  if (filter.mode === 'year') return reported.getFullYear() === filter.year;
  return true;
}

function DateRangeFilter({ value, onChange, years }) {
  const [open, setOpen] = useState(null);
  const boxRef = useRef(null);
  const monthName = new Date(value.year, value.month, 1).toLocaleDateString('en-US', { month: 'long' });
  const today = new Date();
  const monthActive = value.mode === 'month' || value.mode === 'date';

  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const setQuickMode = (mode) => {
    onChange({ ...value, mode, date: null });
    setOpen(null);
  };

  const shiftMonth = (delta) => {
    const next = new Date(value.year, value.month + delta, 1);
    onChange({
      ...value,
      mode: value.mode === 'date' ? 'month' : (value.mode === 'year' ? 'month' : value.mode),
      month: next.getMonth(),
      year: next.getFullYear(),
      date: null,
    });
  };

  return (
    <div className={styles.dateSegmentedBar} ref={boxRef}>
      <button
        type="button"
        className={`${styles.dateSegmentBtn} ${value.mode === 'all' ? styles.dateSegmentBtnActive : ''}`}
        onClick={() => setQuickMode('all')}
      >
        <span className={styles.dateSegmentIcon}>🗂️</span>
        All time
      </button>
      <button
        type="button"
        className={`${styles.dateSegmentBtn} ${value.mode === 'day' ? styles.dateSegmentBtnActive : ''}`}
        onClick={() => setQuickMode('day')}
      >
        <span className={styles.dateSegmentIcon}>📅</span>
        Today
      </button>
      <button
        type="button"
        className={`${styles.dateSegmentBtn} ${value.mode === 'week' ? styles.dateSegmentBtnActive : ''}`}
        onClick={() => setQuickMode('week')}
      >
        <span className={styles.dateSegmentIcon}>📆</span>
        This week
      </button>

      <div className={styles.datePickerWrap}>
        <button
          type="button"
          className={`${styles.dateSegmentBtn} ${monthActive ? styles.dateSegmentBtnActive : ''}`}
          onClick={() => {
            onChange({ ...value, mode: value.mode === 'date' ? 'date' : 'month' });
            setOpen((prev) => (prev === 'month' ? null : 'month'));
          }}
        >
          <span className={styles.dateSegmentIcon}>🗓️</span>
          {value.mode === 'date' && value.date
            ? new Date(`${value.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : monthName}
        </button>
        <button
          type="button"
          className={`${styles.dateSegmentBtn} ${value.mode === 'year' ? styles.dateSegmentBtnActive : ''}`}
          onClick={() => {
            onChange({ ...value, mode: 'year', date: null });
            setOpen((prev) => (prev === 'year' ? null : 'year'));
          }}
        >
          <span className={styles.dateSegmentIcon}>📊</span>
          {value.year}
        </button>

        {open === 'month' && (
          <div className={styles.datePickerPop} role="dialog" aria-label="Pick a date">
            <div className={styles.datePickerHead}>
              <button type="button" className={styles.datePickerNav} onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
              <strong>{monthName}</strong>
              <select
                className={styles.datePickerYearSelect}
                value={value.year}
                aria-label="Select year"
                onChange={(e) => {
                  onChange({ ...value, mode: 'month', year: Number(e.target.value), date: null });
                }}
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <button type="button" className={styles.datePickerNav} onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
            </div>
            <div className={styles.datePickerWeek}>
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className={styles.datePickerGrid}>
              {calendarCells(value.year, value.month).map((day, idx) => {
                if (day == null) return <span key={`e-${idx}`} />;
                const iso = `${value.year}-${padDatePart(value.month + 1)}-${padDatePart(day)}`;
                const isToday = sameCalendarDay(new Date(value.year, value.month, day), today);
                const isSelected = value.mode === 'date' && value.date === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    className={`${styles.datePickerDay} ${isToday ? styles.datePickerToday : ''} ${isSelected ? styles.datePickerDayActive : ''}`}
                    onClick={() => {
                      onChange({ ...value, mode: 'date', date: iso });
                      setOpen(null);
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {open === 'year' && (
          <div className={`${styles.datePickerPop} ${styles.datePickerYearPop}`} role="listbox" aria-label="Pick a year">
            <p className={styles.datePickerYearTitle}>Select year</p>
            <div className={styles.datePickerYearGrid}>
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={`${styles.datePickerYearBtn} ${value.year === year ? styles.datePickerDayActive : ''}`}
                  onClick={() => {
                    onChange({ ...value, mode: 'year', year, date: null });
                    setOpen(null);
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatLocation(loc) {
  return formatIncidentLocation(loc);
}

function isIncidentOutside(inc) {
  const loc = Array.isArray(inc?.locations) ? inc.locations[0] : inc?.locations;
  if (loc?.latitude == null || loc?.longitude == null) return false;
  return !isWithinCabadbaran(Number(loc.latitude), Number(loc.longitude));
}

function isIncomingIncident(inc) {
  return inc?.incident_status === 'Pending' || inc?.incident_status === 'Outside';
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
      { id: 'analytics', icon: '📈', label: 'Analytics' },
      { id: 'archive', icon: '📁', label: 'Archive' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'responders', icon: '🚑', label: 'Ambulance' },
      { id: 'dispatch', icon: '📡', label: 'Dispatch' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'users', icon: '👥', label: 'Users' },
      { id: 'activity-logs', icon: '📋', label: 'Activity Logs' },
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
  { id: 'outside', icon: '⚠️', label: 'Outside' },
  { id: 'referred', icon: '📤', label: 'Referred' },
  { id: 'cancelled', icon: '❌', label: 'Cancelled' },
];

const ARCHIVE_MODULE_TABS = [
  { id: 'accident', icon: '🚨', label: 'Accident' },
  { id: 'dispatch', icon: '📡', label: 'Dispatch' },
  { id: 'users', icon: '👥', label: 'Users' },
];

const DISPATCH_ARCHIVE_COLUMNS = [
  { key: 'dispatch_record_id', label: 'ID', render: (row) => <strong>#{row.dispatch_record_id}</strong> },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'modulation', label: 'Destination' },
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

const USER_ARCHIVE_COLUMNS = [
  { key: 'user_id', label: 'ID', render: (row) => <strong>#{row.user_id}</strong> },
  { key: 'name', label: 'Name', render: (row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '—' },
  { key: 'email', label: 'Email' },
  { key: 'phone_number', label: 'Phone' },
  { key: 'account_status', label: 'Status', render: () => 'Deleted' },
  { key: 'date_registered', label: 'Registered', render: (row) => formatDate(row.date_registered) },
];

const ADMIN_ARCHIVE_COLUMNS = [
  { key: 'admin_id', label: 'ID', render: (row) => <strong>#{row.admin_id}</strong> },
  { key: 'name', label: 'Name', render: (row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '—' },
  { key: 'username', label: 'Username', render: (row) => `@${row.username}` },
  { key: 'role', label: 'Role' },
  { key: 'contact_number', label: 'Contact' },
  { key: 'account_status', label: 'Status', render: () => 'Deleted' },
];

function userSearchText(row) {
  return [
    row.user_id,
    row.first_name,
    row.last_name,
    row.email,
    row.phone_number,
    row.address,
  ].filter(Boolean).join(' ');
}

function adminSearchText(row) {
  return [
    row.admin_id,
    row.first_name,
    row.last_name,
    row.username,
    row.role,
    row.contact_number,
  ].filter(Boolean).join(' ');
}

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
  const categories = matchingTypeNames(categoryFilter);
  if (subFilter) {
    const subs = matchingSubTypeNames(subFilter);
    return categories.some((cat) =>
      subs.some((sub) => t === `${cat} — ${sub}` || t.includes(sub))
    );
  }
  return categories.some(
    (cat) => t === cat || t.startsWith(`${cat} —`) || t.startsWith(cat)
  );
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
  statusDropdown = false,
  onStatusChange,
  updatingStatusId = null,
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
  }, [search, categoryFilter, subFilter]);

  const filteredIds = filteredRows.map((inc) => inc.incident_id);
  const selectedCount = filteredIds.filter((id) => selectedSet.has(id)).length;
  const allFilteredSelected = filteredIds.length > 0 && selectedCount === filteredIds.length;
  const colCount = 8 + (selectable ? 1 : 0) + (hasActions ? 1 : 0);

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
                  <th>Location</th><th>Assigned</th><th>Status</th><th>Date</th>
                  {hasActions && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((inc) => {
                  const loc = Array.isArray(inc.locations) ? inc.locations[0] : inc.locations;
                  const assigned = getAssignedResponder(inc);
                  const statusOptions = getStatusesForIncident(inc, inc.incident_status, true);
                  const statusValue = statusOptions.some((s) => s.value === inc.incident_status)
                    ? inc.incident_status
                    : (statusOptions[0]?.value || inc.incident_status);
                  const unread = isIncomingIncident(inc) && !inc.viewed;
                  const rowClass = [
                    onEdit ? styles.incidentRowClickable : '',
                    unread ? styles.incidentRowUnread : '',
                  ].filter(Boolean).join(' ') || undefined;
                  return (
                    <tr
                      key={inc.incident_id}
                      className={rowClass}
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
                      <td>
                        <strong>#{inc.incident_id}</strong>
                        {isIncomingIncident(inc) && (
                          unread ? (
                            <span className={styles.incidentNewBadge}>New</span>
                          ) : (
                            <span className={styles.incidentViewedMark}>Viewed</span>
                          )
                        )}
                      </td>
                      <td className={styles.compactCell}>{inc.incident_type}</td>
                      <td className={styles.descCell}>{inc.incident_description || '—'}</td>
                      <td>
                        {inc.users ? (
                          <div>
                            <div>{`${inc.users.first_name} ${inc.users.last_name}`}</div>
                            <div style={{ color: '#1565c0', fontSize: 12, fontWeight: 700 }}>
                              {inc.users.phone_number || '—'}
                            </div>
                          </div>
                        ) : <span style={{ color: '#bbb' }}>—</span>}
                      </td>
                      <td className={styles.descCell} style={{ color: '#888', fontSize: 12 }}>
                        {formatLocation(loc)}
                        {isIncidentOutside(inc) && (
                          <div className={styles.outsideBadge}>Outside boundary</div>
                        )}
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
                      <td onClick={statusDropdown ? (e) => e.stopPropagation() : undefined}>
                        {statusDropdown ? (
                          <select
                            className={styles.outsideStatusSelect}
                            value={statusValue}
                            disabled={updatingStatusId === inc.incident_id}
                            onChange={(e) => onStatusChange?.(inc, e.target.value)}
                            style={{ background: statusColor(statusValue) }}
                          >
                            {statusOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={styles.statusBadge}
                            style={{ background: statusColor(inc.incident_status) }}
                          >
                            <span className={styles.statusDotBadge} />
                            {displayIncidentStatus(inc.incident_status)}
                          </span>
                        )}
                      </td>
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
  }, [search]);

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

/* ─── Add Admin Modal ──────────────────────────────────── */
const ADMIN_ROLES = ['Admin', 'User'];

function AddAdminModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '',
    username: '', password: '', confirm_password: '',
    role: 'Admin', contact_number: '',
  });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setErr('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.username || !form.password) {
      setErr('First name, last name, username and password are required.'); return;
    }
    if (form.password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    if (form.password !== form.confirm_password) { setErr('Passwords do not match.'); return; }
    setSaving(true); setErr('');
    try {
      await api.post('/admin/register', {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || undefined,
        last_name: form.last_name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        contact_number: form.contact_number.trim() || undefined,
      });
      setSuccess('Admin account created successfully!');
      setTimeout(onCreated, 900);
    } catch (e2) {
      setErr(e2.message || 'Failed to create admin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={OVERLAY}>
      <div style={MODAL_BOX}>
        <div style={MODAL_HEAD}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
            Add
          </h3>
          <button onClick={onClose} style={CLOSE_BTN} aria-label="Close">✕</button>
        </div>

        {err && (
          <div style={ERR_BOX}>⚠️ {err}</div>
        )}
        {success && (
          <div style={SUC_BOX}>✅ {success}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* name row */}
          <div style={TWO_COL}>
            <MField label="First Name *" name="first_name" value={form.first_name} onChange={handleChange} placeholder="First name" />
            <MField label="Last Name *"  name="last_name"  value={form.last_name}  onChange={handleChange} placeholder="Last name" />
          </div>
          <MField label="Middle Name" name="middle_name" value={form.middle_name} onChange={handleChange} placeholder="Middle name (optional)" />
          <div style={TWO_COL}>
            <MField label="Username *"       name="username"       value={form.username}       onChange={handleChange} placeholder="Choose a username" />
            <MField label="Contact Number"   name="contact_number" value={form.contact_number} onChange={handleChange} placeholder="09XXXXXXXXX" />
          </div>

          {/* role */}
          <div style={FIELD_WRAP}>
            <label style={LBL}>Role</label>
            <select name="role" value={form.role} onChange={handleChange} style={INPUT_STYLE}>
              {ADMIN_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* passwords */}
          <div style={TWO_COL}>
            <div style={FIELD_WRAP}>
              <label style={LBL}>Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Min 6 characters"
                  style={{ ...INPUT_STYLE, paddingRight: 40 }}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPwd(p => !p)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14 }}>
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <MField label="Confirm Password *" name="confirm_password" value={form.confirm_password} onChange={handleChange} placeholder="Re-enter password" type="password" />
          </div>

          {/* actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, height: 44, border: '1.5px solid #E5E7EB', borderRadius: 10, background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 1, height: 44, border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#C1121F,#8B0000)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal helpers ── */
function MField({ label, name, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={FIELD_WRAP}>
      <label style={LBL}>{label}</label>
      <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} style={INPUT_STYLE} autoComplete="off" />
    </div>
  );
}

const OVERLAY   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 };
const MODAL_BOX = { background: '#fff', borderRadius: 16, padding: '24px 26px', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', border: '1px solid #E5E7EB' };
const MODAL_HEAD = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #F3F4F6' };
const CLOSE_BTN  = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6B7280', padding: 4, lineHeight: 1 };
const FIELD_WRAP = { display: 'flex', flexDirection: 'column', marginBottom: 12 };
const TWO_COL    = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const LBL        = { fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 };
const INPUT_STYLE = { height: 42, padding: '0 12px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', color: '#111827', background: '#FAFAFA', outline: 'none', width: '100%', boxSizing: 'border-box' };
const ERR_BOX    = { background: '#fff5f5', border: '1.5px solid #fca5a5', borderLeft: '4px solid #C1121F', color: '#7f1d1d', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 };
const SUC_BOX    = { background: '#f0fdf4', border: '1.5px solid #86efac', borderLeft: '4px solid #16a34a', color: '#14532d', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 };

function UserDetailsModal({ user: target, onClose }) {
  const blocked = target.account_status !== 'Active';
  const reason = BLOCK_REASONS.find((r) => r.id === target.block_reason);
  const fullName = [target.first_name, target.middle_name, target.last_name].filter(Boolean).join(' ');

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={MODAL_BOX} onClick={(e) => e.stopPropagation()}>
        <div style={MODAL_HEAD}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
            User Details — #{target.user_id}
          </h3>
          <button onClick={onClose} style={CLOSE_BTN} aria-label="Close">✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <DetailCell label="Name" value={fullName || '—'} />
          <DetailCell label="Status" value={blocked ? 'Blocked' : (target.account_status || 'Active')} />
          <DetailCell label="Email" value={target.email || '—'} />
          <DetailCell label="Mobile Number" value={target.phone_number || '—'} />
          <DetailCell label="Address" value={target.address || '—'} wide />
          <DetailCell label="Registered" value={formatDate(target.date_registered)} />
        </div>
        {blocked && (
          <div style={{
            marginTop: 16,
            background: '#fff7ed',
            border: '1.5px solid #fdba74',
            borderLeft: '4px solid #c2410c',
            borderRadius: 10,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#9a3412', textTransform: 'uppercase', marginBottom: 6 }}>
              Why this account is blocked
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#7c2d12', marginBottom: 4 }}>
              {reason?.label || 'Administrator decision'}
            </div>
            <div style={{ fontSize: 13, color: '#9a3412', lineHeight: 1.5 }}>
              {reason?.detail || 'The administrator restricted this account.'}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%', height: 44, border: '1.5px solid #E5E7EB', borderRadius: 10, background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function AdminDetailsModal({ admin: target, onClose }) {
  const blocked = target.account_status === 'Blocked';
  const reason = BLOCK_REASONS.find((r) => r.id === target.block_reason);
  const fullName = [target.first_name, target.middle_name, target.last_name].filter(Boolean).join(' ');

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={MODAL_BOX} onClick={(e) => e.stopPropagation()}>
        <div style={MODAL_HEAD}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
            Admin Details — #{target.admin_id}
          </h3>
          <button onClick={onClose} style={CLOSE_BTN} aria-label="Close">✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <DetailCell label="Name" value={fullName || '—'} />
          <DetailCell label="Status" value={blocked ? 'Blocked' : (target.account_status || 'Active')} />
          <DetailCell label="Username" value={target.username ? `@${target.username}` : '—'} />
          <DetailCell label="Role" value={target.role || '—'} />
          <DetailCell label="Contact" value={target.contact_number || '—'} wide />
        </div>
        {blocked && (
          <div style={{
            marginTop: 16,
            background: '#fff7ed',
            border: '1.5px solid #fdba74',
            borderLeft: '4px solid #c2410c',
            borderRadius: 10,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#9a3412', textTransform: 'uppercase', marginBottom: 6 }}>
              Why this account is blocked
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#7c2d12', marginBottom: 4 }}>
              {reason?.label || 'Administrator decision'}
            </div>
            <div style={{ fontSize: 13, color: '#9a3412', lineHeight: 1.5 }}>
              {reason?.detail || 'The administrator restricted this account.'}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%', height: 44, border: '1.5px solid #E5E7EB', borderRadius: 10, background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function DetailCell({ label, value, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : undefined, background: '#F8FAFC', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function EditUserModal({ user: target, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: target.first_name || '',
    middle_name: target.middle_name || '',
    last_name: target.last_name || '',
    email: target.email || '',
    phone_number: target.phone_number || '',
    address: target.address || '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setErr('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) {
      setErr('First name, last name, and email are required.');
      return;
    }
    if (form.password && form.password.length < 6) {
      setErr('New password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim(),
        address: form.address.trim(),
      };
      if (form.password) payload.password = form.password;
      await api.patch(`/auth/users/${target.user_id}`, payload);
      onSaved();
    } catch (e2) {
      setErr(e2.message || 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={OVERLAY}>
      <div style={MODAL_BOX}>
        <div style={MODAL_HEAD}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
            Edit User — #{target.user_id}
          </h3>
          <button onClick={onClose} style={CLOSE_BTN} aria-label="Close">✕</button>
        </div>
        {err && <div style={ERR_BOX}>⚠️ {err}</div>}
        <form onSubmit={handleSubmit}>
          <div style={TWO_COL}>
            <MField label="First Name *" name="first_name" value={form.first_name} onChange={handleChange} placeholder="First name" />
            <MField label="Last Name *" name="last_name" value={form.last_name} onChange={handleChange} placeholder="Last name" />
          </div>
          <MField label="Middle Name" name="middle_name" value={form.middle_name} onChange={handleChange} placeholder="Optional" />
          <MField label="Email *" name="email" value={form.email} onChange={handleChange} placeholder="email@example.com" />
          <div style={TWO_COL}>
            <MField label="Phone" name="phone_number" value={form.phone_number} onChange={handleChange} placeholder="09XXXXXXXXX" />
            <MField label="New Password" name="password" value={form.password} onChange={handleChange} placeholder="Leave blank to keep" type="password" />
          </div>
          <MField label="Address" name="address" value={form.address} onChange={handleChange} placeholder="Address" />
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, height: 44, border: '1.5px solid #E5E7EB', borderRadius: 10, background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 1, height: 44, border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#C1121F,#8B0000)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAdminModal({ admin, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: admin.first_name || '',
    middle_name: admin.middle_name || '',
    last_name: admin.last_name || '',
    username: admin.username || '',
    contact_number: admin.contact_number || '',
    role: ADMIN_ROLES.includes(admin.role) ? admin.role : 'Admin',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setErr('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.username) {
      setErr('First name, last name, and username are required.');
      return;
    }
    if (form.password && form.password.length < 6) {
      setErr('New password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim(),
        last_name: form.last_name.trim(),
        username: form.username.trim(),
        contact_number: form.contact_number.trim(),
        role: form.role,
      };
      if (form.password) payload.password = form.password;
      await api.patch(`/admin/${admin.admin_id}`, payload);
      onSaved();
    } catch (e2) {
      setErr(e2.message || 'Failed to update admin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={OVERLAY}>
      <div style={MODAL_BOX}>
        <div style={MODAL_HEAD}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
            Edit Admin — #{admin.admin_id}
          </h3>
          <button onClick={onClose} style={CLOSE_BTN} aria-label="Close">✕</button>
        </div>
        {err && <div style={ERR_BOX}>⚠️ {err}</div>}
        <form onSubmit={handleSubmit}>
          <div style={TWO_COL}>
            <MField label="First Name *" name="first_name" value={form.first_name} onChange={handleChange} placeholder="First name" />
            <MField label="Last Name *" name="last_name" value={form.last_name} onChange={handleChange} placeholder="Last name" />
          </div>
          <MField label="Middle Name" name="middle_name" value={form.middle_name} onChange={handleChange} placeholder="Optional" />
          <div style={TWO_COL}>
            <MField label="Username *" name="username" value={form.username} onChange={handleChange} placeholder="Username" />
            <MField label="Contact Number" name="contact_number" value={form.contact_number} onChange={handleChange} placeholder="09XXXXXXXXX" />
          </div>
          <div style={FIELD_WRAP}>
            <label style={LBL}>Role</label>
            <select name="role" value={form.role} onChange={handleChange} style={INPUT_STYLE}>
              {ADMIN_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <MField label="New Password" name="password" value={form.password} onChange={handleChange} placeholder="Leave blank to keep" type="password" />
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, height: 44, border: '1.5px solid #E5E7EB', borderRadius: 10, background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 1, height: 44, border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#C1121F,#8B0000)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
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
  const [admins, setAdmins] = useState([]);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [userSubTab, setUserSubTab] = useState('mobile');
  const [editingUser, setEditingUser] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [viewingAdmin, setViewingAdmin] = useState(null);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [editingIncident, setEditingIncident] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [assigningIncident, setAssigningIncident] = useState(null);
  const [liveMapFocusId, setLiveMapFocusId] = useState(null);
  const [responderModal, setResponderModal] = useState(null);
  const [viewingResponder, setViewingResponder] = useState(null);
  const [incidentFilter, setIncidentFilter] = useState('pending');
  const [incidentDateFilter, setIncidentDateFilter] = useState(() => makeDateFilter());
  const [dashboardDateFilter, setDashboardDateFilter] = useState(() => makeDateFilter());
  const [archiveModule, setArchiveModule] = useState('accident');
  const [archiveSelectedIds, setArchiveSelectedIds] = useState(() => new Set());
  const [archiveDispatchRows, setArchiveDispatchRows] = useState([]);
  const [archiveCallLogs, setArchiveCallLogs] = useState([]);
  const [archiveRecordsLoading, setArchiveRecordsLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [archiveUserTab, setArchiveUserTab] = useState('mobile');

  const fetchData = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setIsLoading(true);
      setError('');
    }
    try {
      const [usersRes, incidentsRes, respondersRes, dispatchRes, adminsRes] = await Promise.all([
        api.get('/auth/users'),
        api.get('/incidents/all'),
        api.get('/responders'),
        api.get('/dispatch/all'),
        api.get('/admin/list').catch(() => ({ data: [] })),
      ]);

      const usersData      = usersRes.data;
      const incidentsData  = incidentsRes.data;
      const respondersData = respondersRes.data;
      const dispatchData   = dispatchRes.data;

      setUsers(usersData);
      setAdmins(adminsRes.data || []);
      setIncidents(incidentsData);
      setResponders(respondersData);
      setDispatches(dispatchData);
      setStats({
        users:      usersData.filter((u) => u.account_status !== 'Deleted').length,
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
        fetchDispatchRecords({ archived: true }),
        fetchCallLogs({ archived: true }),
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
  }, [archiveModule, archiveUserTab]);

  const handleLogout = () => {
    setConfirmModal({
      title: 'Log out?',
      message: 'Are you sure you want to log out of RapidRescue?',
      confirmLabel: 'Log Out',
      variant: 'logout',
      onConfirm: async () => {
        setConfirmModal(null);
        await logAdminLogout();
        logout();
        navigate('/login');
      },
    });
  };

  const handleShowOnLiveMap = (inc) => {
    markIncidentViewed(inc);
    setLiveMapFocusId(inc.incident_id);
    setActiveTab('live-map');
  };

  const markIncidentViewed = async (inc) => {
    if (!inc?.incident_id || inc.viewed) return;
    setIncidents((prev) =>
      prev.map((row) =>
        Number(row.incident_id) === Number(inc.incident_id) ? { ...row, viewed: true } : row
      )
    );
    try {
      await api.patch(`/incidents/${inc.incident_id}/viewed`);
    } catch {
      /* keep the optimistic viewed mark */
    }
  };

  const handleOpenIncident = (inc) => {
    markIncidentViewed(inc);
    setEditingIncident(inc);
  };

  const handleAssignIncident = (inc) => {
    markIncidentViewed(inc);
    setAssigningIncident(inc);
  };

  const handleOutsideStatusChange = async (inc, nextStatus) => {
    const current = inc.incident_status === 'Pending' ? 'Outside' : inc.incident_status;
    if (nextStatus === current) return;
    setUpdatingStatusId(inc.incident_id);
    setError('');
    try {
      await updateIncidentStatus(inc.incident_id, nextStatus);
      markIncidentViewed(inc);
      await fetchData();
      if (nextStatus === 'Referred') setIncidentFilter('referred');
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const datedIncidents = incidents.filter((i) => matchesIncidentDateRange(i, incidentDateFilter));
  const filterYears = useMemo(() => collectFilterYears(incidents, dispatches), [incidents, dispatches]);
  const referredIncidents = datedIncidents.filter(
    (i) =>
      !['Archived', 'Deleted'].includes(i.incident_status) &&
      i.incident_status === 'Referred'
  );
  const outsideIncidents = datedIncidents.filter(
    (i) =>
      !['Archived', 'Deleted'].includes(i.incident_status) &&
      i.incident_status !== 'Referred' &&
      (isIncidentOutside(i) || OUTSIDE_STATUS_VALUES.includes(i.incident_status))
  );
  const pendingIncidents = datedIncidents.filter(
    (i) => i.incident_status === 'Pending' && !isIncidentOutside(i)
  );
  const unviewedPendingCount = incidents.filter(
    (i) => i.incident_status === 'Pending' && !isIncidentOutside(i) && !i.viewed
  ).length;
  const activeResponseIncidents = datedIncidents.filter(
    (i) => ACTIVE_RESPONSE_STATUSES.includes(i.incident_status) && !isIncidentOutside(i)
  );
  const resolvedIncidents = datedIncidents.filter(
    (i) => i.incident_status === 'Resolved' && !isIncidentOutside(i)
  );
  const cancelledIncidents = datedIncidents.filter(
    (i) => i.incident_status === 'Cancelled' && !isIncidentOutside(i)
  );
  const archivedIncidents = incidents.filter((i) => i.incident_status === 'Archived');
  const deletedIncidents = incidents.filter((i) => i.incident_status === 'Deleted');
  const archiveAccidentRows = [...archivedIncidents, ...deletedIncidents];
  const ongoingIncidents = incidents.filter((i) => ONGOING_STATUSES.includes(i.incident_status));

  const incidentFilterCounts = {
    pending: pendingIncidents.length,
    active: activeResponseIncidents.length,
    outside: outsideIncidents.length,
    referred: referredIncidents.length,
    resolved: resolvedIncidents.length,
    cancelled: cancelledIncidents.length,
  };

  const liveMobileUsers = users.filter((u) => u.account_status !== 'Deleted');
  const deletedUsers = users.filter((u) => u.account_status === 'Deleted');
  const otherAdmins = admins.filter(
    (a) => Number(a.admin_id) !== Number(user?.admin_id) && a.account_status !== 'Deleted'
  );
  const deletedAdmins = admins.filter(
    (a) => Number(a.admin_id) !== Number(user?.admin_id) && a.account_status === 'Deleted'
  );
  const userQuery = userSearch.trim().toLowerCase();
  const filteredMobileUsers = liveMobileUsers.filter((u) => {
    if (userStatusFilter === 'active' && u.account_status !== 'Active') return false;
    if (userStatusFilter === 'blocked' && u.account_status === 'Active') return false;
    if (userQuery && !userSearchText(u).toLowerCase().includes(userQuery)) return false;
    return true;
  });
  const filteredAdmins = otherAdmins.filter((a) => {
    if (userStatusFilter === 'active' && a.account_status !== 'Active') return false;
    if (userStatusFilter === 'blocked' && a.account_status !== 'Blocked') return false;
    if (userQuery && !adminSearchText(a).toLowerCase().includes(userQuery)) return false;
    return true;
  });

  const archiveModuleCounts = {
    accident: archivedIncidents.length + deletedIncidents.length,
    dispatch: archiveDispatchRows.length,
    'call-log': archiveCallLogs.length,
    users: deletedUsers.length + deletedAdmins.length,
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
    else if (status === 'Referred') setIncidentFilter('referred');
    else if (OUTSIDE_STATUS_VALUES.includes(status)) setIncidentFilter('outside');
    else if (ACTIVE_RESPONSE_STATUSES.includes(status) || status === 'Dispatch') setIncidentFilter('active');
    else setIncidentFilter('pending');
  };

  const handleArchive = async (inc) => {
    if (!window.confirm(`Archive incident #${inc.incident_id}? It will move to the Archive tab.`)) return;
    try {
      rememberIncidentStatus(inc.incident_id, inc.incident_status);
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
          rememberIncidentStatus(inc.incident_id, inc.incident_status);
          await deleteIncident(inc.incident_id, inc.incident_status);
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

  const runRestore = async (inc) => {
    const previous = peekIncidentStatus(inc.incident_id);
    const result = await restoreIncident(inc.incident_id, previous);
    takeIncidentStatus(inc.incident_id);
    const nextStatus = result?.incident?.incident_status || previous || 'Pending';
    await fetchData();
    goToRestoredAccident(nextStatus);
  };

  const handleRestore = (inc) => {
    openConfirm({
      title: 'Restore this accident?',
      message: `Restore accident #${inc.incident_id} back to its previous status?`,
      confirmLabel: 'Restore',
      variant: 'info',
      onConfirm: async () => {
        closeConfirm();
        try {
          await runRestore(inc);
        } catch (err) {
          setError(err.message || 'Failed to restore incident.');
          await fetchData();
        }
      },
    });
  };

  const handleBulkRestoreIncidents = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Restore selected accidents?',
      message: `Restore ${ids.length} selected accident(s) back to their previous status?`,
      confirmLabel: 'Restore',
      variant: 'info',
      onConfirm: async () => {
        closeConfirm();
        try {
          const results = await Promise.all(ids.map((id) => {
            const previous = peekIncidentStatus(id);
            return restoreIncident(id, previous).then((result) => {
              takeIncidentStatus(id);
              return result;
            });
          }));
          setArchiveSelectedIds(new Set());
          await fetchData();
          goToRestoredAccident(results[0]?.incident?.incident_status || peekIncidentStatus(ids[0]) || 'Pending');
        } catch (err) {
          setError(err.message || 'Failed to restore selected accidents.');
          await fetchData();
        }
      },
    });
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

  const handleRestoreDispatch = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Restore dispatch record?',
      message: `Restore ${ids.length} dispatch record(s) back to Dispatch?`,
      confirmLabel: 'Restore',
      variant: 'info',
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(ids.map((id) => restoreDispatchRecord(id)));
          setArchiveSelectedIds(new Set());
          await fetchArchiveRecords();
          setActiveTab('dispatch');
        } catch (err) {
          setError(err.message || 'Failed to restore dispatch records.');
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
          await Promise.all(ids.map((id) => permanentDeleteDispatchRecord(id)));
          setArchiveSelectedIds(new Set());
          await fetchArchiveRecords();
        } catch (err) {
          setError(err.message || 'Failed to delete dispatch records.');
        }
      },
    });
  };

  const handleRestoreCallLogs = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Restore call log?',
      message: `Restore ${ids.length} call log(s) back to Call Log?`,
      confirmLabel: 'Restore',
      variant: 'info',
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(ids.map((id) => restoreCallLog(id)));
          setArchiveSelectedIds(new Set());
          await fetchArchiveRecords();
          setActiveTab('call-log');
        } catch (err) {
          setError(err.message || 'Failed to restore call logs.');
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
          await Promise.all(ids.map((id) => permanentDeleteCallLog(id)));
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

  const userIsBlocked = (u) => u.account_status !== 'Active';

  const handleBlockUser = (u) => {
    const blocking = !userIsBlocked(u);
    openConfirm({
      title: blocking ? 'Block this user?' : 'Unblock this user?',
      message: blocking
        ? `${u.first_name} ${u.last_name} will not be able to log in. Choose the reason they will see on the mobile app.`
        : `${u.first_name} ${u.last_name} will be able to log in again.`,
      confirmLabel: blocking ? 'Block' : 'Unblock',
      variant: blocking ? 'warning' : 'info',
      reasonOptions: blocking ? BLOCK_REASONS : undefined,
      onConfirm: async (reasonId) => {
        closeConfirm();
        try {
          await api.patch(`/auth/users/${u.user_id}`, {
            account_status: blocking ? 'Blocked' : 'Active',
            ...(blocking ? { block_reason: reasonId || 'admin' } : {}),
          });
          await fetchData();
        } catch (err) {
          setError(err.message || 'Failed to update user status.');
        }
      },
    });
  };

  const handleDeleteUser = (u) => {
    openConfirm({
      title: 'Move user to Archive?',
      message: `${u.first_name} ${u.last_name} will be moved to Archive. You can restore them later.`,
      confirmLabel: 'Move to Archive',
      variant: 'warning',
      onConfirm: async () => {
        closeConfirm();
        try {
          await api.patch(`/auth/users/${u.user_id}`, { account_status: 'Deleted' });
          await fetchData();
          setActiveTab('archive');
          setArchiveModule('users');
          setArchiveUserTab('mobile');
        } catch (err) {
          setError(err.message || 'Failed to archive user.');
        }
      },
    });
  };

  const handleRestoreUsers = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Restore user(s)?',
      message: `Restore ${ids.length} user(s) back to the Users page?`,
      confirmLabel: 'Restore',
      variant: 'info',
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(ids.map((id) => api.patch(`/auth/users/${id}`, { account_status: 'Active' })));
          setArchiveSelectedIds(new Set());
          await fetchData();
        } catch (err) {
          setError(err.message || 'Failed to restore users.');
        }
      },
    });
  };

  const handlePermanentDeleteUsers = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Permanently delete user(s)?',
      message: `This cannot be undone. ${ids.length} user(s) will be removed. If they have incident records, restore and block them instead.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(ids.map((id) => api.delete(`/auth/users/${id}`)));
          setArchiveSelectedIds(new Set());
          await fetchData();
        } catch (err) {
          setError(err.message || 'Failed to delete users.');
        }
      },
    });
  };

  const handleBlockAdmin = (a) => {
    if (user?.admin_id && Number(user.admin_id) === Number(a.admin_id)) {
      setError('You cannot block your own admin account.');
      return;
    }
    const blocking = a.account_status !== 'Blocked';
    openConfirm({
      title: blocking ? 'Block this admin?' : 'Unblock this admin?',
      message: blocking
        ? `${a.first_name} ${a.last_name} will not be able to sign in to the admin panel. Choose the reason they will see on login.`
        : `${a.first_name} ${a.last_name} will be able to sign in again.`,
      confirmLabel: blocking ? 'Block' : 'Unblock',
      variant: blocking ? 'warning' : 'info',
      reasonOptions: blocking ? BLOCK_REASONS : undefined,
      onConfirm: async (reasonId) => {
        closeConfirm();
        try {
          await api.patch(`/admin/${a.admin_id}`, {
            account_status: blocking ? 'Blocked' : 'Active',
            ...(blocking ? { block_reason: reasonId || 'admin' } : {}),
          });
          await fetchData();
        } catch (err) {
          setError(err.message || 'Failed to update admin status.');
        }
      },
    });
  };

  const handleDeleteAdmin = (a) => {
    if (user?.admin_id && Number(user.admin_id) === Number(a.admin_id)) {
      setError('You cannot delete your own admin account.');
      return;
    }
    openConfirm({
      title: 'Move admin to Archive?',
      message: `${a.first_name} ${a.last_name} (@${a.username}) will be moved to Archive. They will not be able to sign in until restored.`,
      confirmLabel: 'Move to Archive',
      variant: 'warning',
      onConfirm: async () => {
        closeConfirm();
        try {
          await api.patch(`/admin/${a.admin_id}`, { account_status: 'Deleted' });
          await fetchData();
          setActiveTab('archive');
          setArchiveModule('users');
          setArchiveUserTab('admins');
        } catch (err) {
          setError(err.message || 'Failed to archive admin.');
        }
      },
    });
  };

  const handleRestoreAdmins = (ids) => {
    if (!ids?.length) return;
    openConfirm({
      title: 'Restore admin(s)?',
      message: `Restore ${ids.length} admin(s) back to Admin Accounts?`,
      confirmLabel: 'Restore',
      variant: 'info',
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(ids.map((id) => api.patch(`/admin/${id}`, { account_status: 'Active' })));
          setArchiveSelectedIds(new Set());
          await fetchData();
        } catch (err) {
          setError(err.message || 'Failed to restore admins.');
        }
      },
    });
  };

  const handlePermanentDeleteAdmins = (ids) => {
    if (!ids?.length) return;
    if (ids.some((id) => Number(id) === Number(user?.admin_id))) {
      setError('You cannot delete your own admin account.');
      return;
    }
    openConfirm({
      title: 'Permanently delete admin(s)?',
      message: `This cannot be undone. ${ids.length} admin account(s) will be removed.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(ids.map((id) => api.delete(`/admin/${id}`)));
          setArchiveSelectedIds(new Set());
          await fetchData();
        } catch (err) {
          setError(err.message || 'Failed to delete admins.');
        }
      },
    });
  };

  const fullName  = user ? `${user.first_name} ${user.last_name}` : 'Admin';
  const initial   = user ? user.first_name?.charAt(0).toUpperCase() : 'A';
  const adminRole = user?.role || 'Admin';

  const clockStr = clock.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const dateStr  = clock.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

  const dashboardIncidents = incidents.filter((i) => matchesIncidentDateRange(i, dashboardDateFilter));
  const dashboardDispatches = dispatches.filter((d) =>
    matchesIncidentDateRange({ date_reported: d.dispatch_time || d.created_at }, dashboardDateFilter)
  );
  const statCards = [
    { label: 'Users', value: stats.users, icon: '👥', color: STAT_COLORS[0], tab: 'users' },
    { label: 'Incidents', value: dashboardIncidents.length, icon: '🚨', color: STAT_COLORS[1], tab: 'incidents' },
    { label: 'Ambulance', value: stats.responders, icon: '🚑', color: STAT_COLORS[2], tab: 'responders' },
    {
      label: 'Pending',
      value: dashboardIncidents.filter((i) => i.incident_status === 'Pending').length,
      icon: '⏳',
      color: STAT_COLORS[3],
      tab: 'incidents',
      filter: 'pending',
    },
    { label: 'Available', value: stats.available, icon: '✅', color: STAT_COLORS[4], tab: 'responders' },
    { label: 'Dispatches', value: dashboardDispatches.length, icon: '📡', color: STAT_COLORS[5], tab: 'dispatch' },
  ];

  const openStatCard = (card) => {
    if (card.filter) setIncidentFilter(card.filter);
    if (card.tab === 'incidents' && dashboardDateFilter.mode !== 'all') {
      setIncidentDateFilter({ ...dashboardDateFilter });
    }
    setActiveTab(card.tab);
  };

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
            <img src={APP_IMAGES.logo} alt="CDRRMO Cabadbaran" className={styles.sidebarLogoImg} />
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
                  {sidebarOpen && item.id === 'incidents' && unviewedPendingCount > 0 && (
                    <span className={styles.navBadge}>{unviewedPendingCount}</span>
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
          </div>

          <div className={styles.topbarRight}>
            <span className={styles.topbarClock}>
              {clockStr} · {dateStr}
            </span>
            <button
              type="button"
              className={styles.notifBtn}
              title="View new accident requests"
              onClick={() => {
                setActiveTab('incidents');
                setIncidentFilter('pending');
              }}
            >
              🔔
              {unviewedPendingCount > 0 && (
                <span className={styles.notifCount}>{unviewedPendingCount}</span>
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

              <DateRangeFilter
                value={dashboardDateFilter}
                onChange={setDashboardDateFilter}
                years={filterYears}
              />

              {/* Banner */}
              <div className={styles.overviewBanner}>
                <div className={styles.bannerText}>
                  <h3>Cabadbaran City Emergency System</h3>
                  <p>Cabadbaran City, Agusan del Norte</p>
                </div>
                <div className={styles.bannerActions}>
                  <button className={styles.bannerBtn} onClick={() => setActiveTab('live-map')}>🗺️ Live Map</button>
                  <button className={styles.bannerBtn} onClick={() => setActiveTab('incidents')}>🚨 Accident</button>
                </div>
              </div>

              {/* Stats */}
              <div className={styles.statsGrid}>
                {statCards.map((card) => (
                  <button
                    key={card.label}
                    type="button"
                    className={`${styles.statCard} ${styles.statCardClickable} ${styles[card.color]}`}
                    onClick={() => openStatCard(card)}
                  >
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
                  </button>
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
                          <th>Status</th><th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardIncidents.slice(0, 6).map((inc) => (
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
                                style={{ background: statusColor(inc.incident_status) }}
                              >
                                <span className={styles.statusDotBadge} />
                                {displayIncidentStatus(inc.incident_status)}
                              </span>
                            </td>
                            <td style={{ color: '#888', fontSize: 12 }}>{formatDate(inc.date_reported)}</td>
                          </tr>
                        ))}
                        {dashboardIncidents.length === 0 && (
                          <tr><td colSpan={5} className={styles.emptyRow}>📭 No incidents yet.</td></tr>
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

          {activeTab === 'analytics' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Analytics</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
              </div>
              <AccidentReport incidents={incidents} isLoading={isLoading} />
            </div>
          )}

          {/* ── INCIDENTS ────────────────────────────────── */}
          {activeTab === 'incidents' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Accident</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
              </div>

              <DateRangeFilter
                value={incidentDateFilter}
                onChange={setIncidentDateFilter}
                years={filterYears}
              />

              <div className={styles.incidentFilterBar}>
                {INCIDENT_FILTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.incidentFilterBtn} ${incidentFilter === tab.id ? styles.incidentFilterBtnActive : ''} ${tab.id === 'outside' && incidentFilter === 'outside' ? styles.incidentFilterBtnOutside : ''} ${tab.id === 'referred' && incidentFilter === 'referred' ? styles.incidentFilterBtnReferred : ''}`}
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
                    : incidentFilter === 'outside'
                      ? 'Use the status dropdown: Outside → For Referral → Referred → Completed. The reporter sees this on My Alerts.'
                      : incidentFilter === 'referred'
                        ? 'All incidents marked Referred are listed here. Referred is the final status — Completed is no longer available.'
                      : incidentFilter === 'pending'
                        ? 'NEW means this request has not been reviewed yet. Click the row to open details — it will be marked Viewed.'
                        : 'Click the buttons above to switch between incident groups.'}
              </p>

              {incidentFilter === 'pending' && (
                <IncidentTableSection
                  title="Pending"
                  icon="⏳"
                  rows={pendingIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No pending incidents."
                  onEdit={handleOpenIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onAssign={handleAssignIncident}
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
                  onEdit={handleOpenIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onAssign={handleAssignIncident}
                  onShowMap={handleShowOnLiveMap}
                  showAssignActions
                  hideTitle
                />
              )}

              {incidentFilter === 'outside' && (
                <IncidentTableSection
                  title="Outside"
                  icon="⚠️"
                  rows={outsideIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No incidents outside the service boundary."
                  onEdit={handleOpenIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onAssign={handleAssignIncident}
                  onShowMap={handleShowOnLiveMap}
                  showAssignActions
                  statusDropdown
                  onStatusChange={handleOutsideStatusChange}
                  updatingStatusId={updatingStatusId}
                  hideTitle
                />
              )}

              {incidentFilter === 'referred' && (
                <IncidentTableSection
                  title="Referred"
                  icon="📤"
                  rows={referredIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No referred incidents."
                  onEdit={handleOpenIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onAssign={handleAssignIncident}
                  onShowMap={handleShowOnLiveMap}
                  showAssignActions
                  statusDropdown
                  onStatusChange={handleOutsideStatusChange}
                  updatingStatusId={updatingStatusId}
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
                  onEdit={handleOpenIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onShowMap={handleShowOnLiveMap}
                  showAssignActions={false}
                  actions={{ edit: true, archive: false, delete: true }}
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
                  onEdit={handleOpenIncident}
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
                    onEdit={handleOpenIncident}
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
                    Deleted dispatch records. Restore sends them back to Dispatch. Delete removes them permanently.
                  </p>
                  <ArchiveRecordsTable
                    rows={archiveDispatchRows}
                    columns={DISPATCH_ARCHIVE_COLUMNS}
                    idKey="dispatch_record_id"
                    isLoading={archiveRecordsLoading}
                    emptyMessage="📭 No archived dispatch records yet."
                    selectedIds={archiveSelectedIds}
                    onToggleSelect={toggleArchiveSelect}
                    onToggleSelectAll={toggleArchiveSelectAll}
                    onRestore={handleRestoreDispatch}
                    onDelete={handleBulkDeleteDispatch}
                    searchPlaceholder="Search dispatch records..."
                    getSearchText={dispatchRecordSearchText}
                  />
                </>
              )}

              {archiveModule === 'call-log' && (
                <>
                  <p className={styles.archiveHint}>
                    Deleted call logs. Restore sends them back to Call Log. Delete removes them permanently.
                  </p>
                  <ArchiveRecordsTable
                    rows={archiveCallLogs}
                    columns={CALL_LOG_ARCHIVE_COLUMNS}
                    idKey="call_log_id"
                    isLoading={archiveRecordsLoading}
                    emptyMessage="📭 No archived call logs yet."
                    selectedIds={archiveSelectedIds}
                    onToggleSelect={toggleArchiveSelect}
                    onToggleSelectAll={toggleArchiveSelectAll}
                    onRestore={handleRestoreCallLogs}
                    onDelete={handleBulkDeleteCallLogs}
                    searchPlaceholder="Search call logs..."
                    getSearchText={callLogSearchText}
                  />
                </>
              )}

              {archiveModule === 'users' && (
                <>
                  <p className={styles.archiveHint}>
                    Deleted users and admins stay here. Restore sends them back to Users. Delete removes them permanently.
                  </p>
                  <div className={styles.subTabRow}>
                    <button
                      className={`${styles.subTab} ${archiveUserTab === 'mobile' ? styles.subTabActive : ''}`}
                      onClick={() => setArchiveUserTab('mobile')}
                    >
                      Deleted Users ({deletedUsers.length})
                    </button>
                    <button
                      className={`${styles.subTab} ${archiveUserTab === 'admins' ? styles.subTabActive : ''}`}
                      onClick={() => setArchiveUserTab('admins')}
                    >
                      Deleted Admins ({deletedAdmins.length})
                    </button>
                  </div>
                  {archiveUserTab === 'mobile' ? (
                    <ArchiveRecordsTable
                      rows={deletedUsers}
                      columns={USER_ARCHIVE_COLUMNS}
                      idKey="user_id"
                      isLoading={isLoading}
                      emptyMessage="No deleted mobile users yet."
                      selectedIds={archiveSelectedIds}
                      onToggleSelect={toggleArchiveSelect}
                      onToggleSelectAll={toggleArchiveSelectAll}
                      onRestore={handleRestoreUsers}
                      onDelete={handlePermanentDeleteUsers}
                      searchPlaceholder="Search deleted users..."
                      getSearchText={userSearchText}
                    />
                  ) : (
                    <ArchiveRecordsTable
                      rows={deletedAdmins}
                      columns={ADMIN_ARCHIVE_COLUMNS}
                      idKey="admin_id"
                      isLoading={isLoading}
                      emptyMessage="No deleted admin accounts yet."
                      selectedIds={archiveSelectedIds}
                      onToggleSelect={toggleArchiveSelect}
                      onToggleSelectAll={toggleArchiveSelectAll}
                      onRestore={handleRestoreAdmins}
                      onDelete={handlePermanentDeleteAdmins}
                      searchPlaceholder="Search deleted admins..."
                      getSearchText={adminSearchText}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'activity-logs' && <ActivityLogsPage />}

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
                    <span>Ambulance</span>
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
                <h2 className={styles.sectionTitle}>Ambulance</h2>
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
                          <tr
                            key={r.responder_id}
                            className={styles.incidentRowClickable}
                            onClick={() => setViewingResponder(r)}
                          >
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
                            <td onClick={(e) => e.stopPropagation()}>
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
          {activeTab === 'dispatch' && (
            <DispatchPage
              onArchived={() => {
                setActiveTab('archive');
                setArchiveModule('dispatch');
                fetchArchiveRecords();
              }}
            />
          )}

          {/* ── CALL LOG ─────────────────────────────────── */}
          {activeTab === 'call-log' && (
            <CallLogPage
              onArchived={() => {
                setActiveTab('archive');
                setArchiveModule('call-log');
                fetchArchiveRecords();
              }}
            />
          )}

          {/* ── USERS ────────────────────────────────────── */}
          {activeTab === 'users' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Users & Admins</h2>
                <div className={styles.tabHeaderActions}>
                  <button className={styles.addBtn} onClick={() => setShowAddAdmin(true)}>
                    + Add
                  </button>
                  <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
                </div>
              </div>

              {/* sub-tabs */}
              <div className={styles.subTabRow}>
                <button
                  className={`${styles.subTab} ${userSubTab === 'mobile' ? styles.subTabActive : ''}`}
                  onClick={() => setUserSubTab('mobile')}
                >
                  📱 Mobile Users ({liveMobileUsers.length})
                </button>
                <button
                  className={`${styles.subTab} ${userSubTab === 'admins' ? styles.subTabActive : ''}`}
                  onClick={() => setUserSubTab('admins')}
                >
                  🛡️ Admin Accounts ({otherAdmins.length})
                </button>
              </div>

              {/* Mobile Users table */}
              {userSubTab === 'mobile' && (
                <div className={styles.tableCard}>
                  <div className={styles.incidentToolbar}>
                    <input
                      type="search"
                      className={styles.incidentSearch}
                      placeholder="Search users by name, email, or phone..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    <select
                      className={styles.incidentTypeFilter}
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="active">Active</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                  {isLoading ? <TableLoader /> : (
                    <div className={styles.tableWrapper}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>ID</th><th>Name</th><th>Email</th><th>Phone</th>
                            <th>Address</th><th>Status</th><th>Registered</th><th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMobileUsers.map((u) => {
                            const blocked = u.account_status !== 'Active';
                            return (
                            <tr
                              key={u.user_id}
                              className={styles.incidentRowClickable}
                              onClick={() => setViewingUser(u)}
                            >
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
                                <span className={`${styles.statusBadge} ${blocked ? styles.statusBlocked : styles.statusActive}`}>
                                  <span className={styles.statusDotBadge} />
                                  {blocked ? 'Blocked' : 'Active'}
                                </span>
                                {blocked && u.block_reason && (
                                  <div style={{ fontSize: 11, color: '#9a3412', marginTop: 4, maxWidth: 160 }}>
                                    {BLOCK_REASONS.find((r) => r.id === u.block_reason)?.label || u.block_reason}
                                  </div>
                                )}
                              </td>
                              <td style={{ color: '#888', fontSize: 12 }}>{formatDate(u.date_registered)}</td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div className={styles.actionGroup}>
                                  <button type="button" className={styles.editBtn} onClick={() => setEditingUser(u)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className={blocked ? styles.unblockBtn : styles.blockBtn}
                                    onClick={() => handleBlockUser(u)}
                                  >
                                    {blocked ? 'Unblock' : 'Block'}
                                  </button>
                                  <button type="button" className={styles.deleteBtn} onClick={() => handleDeleteUser(u)}>
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                            );
                          })}
                          {filteredMobileUsers.length === 0 && (
                            <tr><td colSpan={8} className={styles.emptyRow}>No users match this search.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Admin Accounts table */}
              {userSubTab === 'admins' && (
                <div className={styles.tableCard}>
                  <div className={styles.incidentToolbar}>
                    <input
                      type="search"
                      className={styles.incidentSearch}
                      placeholder="Search admins by name, username, or role..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    <select
                      className={styles.incidentTypeFilter}
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="active">Active</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                  {isLoading ? <TableLoader /> : (
                    <div className={styles.tableWrapper}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>ID</th><th>Name</th><th>Username</th><th>Role</th>
                            <th>Contact</th><th>Status</th><th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAdmins.map((a) => {
                            const blocked = a.account_status === 'Blocked';
                            return (
                            <tr
                              key={a.admin_id}
                              className={styles.incidentRowClickable}
                              onClick={() => setViewingAdmin(a)}
                            >
                              <td><strong>#{a.admin_id}</strong></td>
                              <td>
                                <div className={styles.userCell}>
                                  <div className={styles.userAvatar} style={{ background: '#7c3aed' }}>
                                    {a.first_name?.charAt(0).toUpperCase()}
                                  </div>
                                  <span className={styles.userName2}>{a.first_name} {a.last_name}</span>
                                </div>
                              </td>
                              <td><code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>@{a.username}</code></td>
                              <td>
                                <span className={`${styles.statusBadge} ${styles.statusActive}`}
                                  style={{ background: '#ede9fe', color: '#5b21b6', borderColor: '#ddd6fe' }}>
                                  🛡️ {a.role}
                                </span>
                              </td>
                              <td style={{ color: '#888' }}>{a.contact_number || '—'}</td>
                              <td>
                                <span className={`${styles.statusBadge} ${blocked ? styles.statusBlocked : styles.statusActive}`}>
                                  <span className={styles.statusDotBadge} />
                                  {blocked ? 'Blocked' : 'Active'}
                                </span>
                                {blocked && a.block_reason && (
                                  <div style={{ fontSize: 11, color: '#9a3412', marginTop: 4, maxWidth: 160 }}>
                                    {BLOCK_REASONS.find((r) => r.id === a.block_reason)?.label || a.block_reason}
                                  </div>
                                )}
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div className={styles.actionGroup}>
                                  <button type="button" className={styles.editBtn} onClick={() => setEditingAdmin(a)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className={blocked ? styles.unblockBtn : styles.blockBtn}
                                    onClick={() => handleBlockAdmin(a)}
                                  >
                                    {blocked ? 'Unblock' : 'Block'}
                                  </button>
                                  <button type="button" className={styles.deleteBtn} onClick={() => handleDeleteAdmin(a)}>
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                            );
                          })}
                          {filteredAdmins.length === 0 && (
                            <tr><td colSpan={7} className={styles.emptyRow}>No other admin accounts match this search.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editingIncident && (
        <IncidentStatusModal
          incident={editingIncident}
          responders={responders}
          users={users}
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
      {viewingResponder && (
        <RecordDetailsModal
          title={`Responder Details — #${viewingResponder.responder_id}`}
          fields={[
            { label: 'Name', value: [viewingResponder.first_name, viewingResponder.middle_name, viewingResponder.last_name].filter(Boolean).join(' ') },
            { label: 'Type', value: viewingResponder.responder_type },
            { label: 'Contact', value: viewingResponder.contact_number },
            { label: 'Status', value: viewingResponder.availability_status },
            { label: 'On call', value: viewingResponder.occupied ? `Yes — Accident #${viewingResponder.occupied_incident_id}` : 'No' },
          ]}
          onClose={() => setViewingResponder(null)}
          onEdit={() => {
            const responder = viewingResponder;
            setViewingResponder(null);
            setResponderModal({ mode: 'edit', responder });
          }}
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
          variant={confirmModal.variant || 'danger'}
          reasonOptions={confirmModal.reasonOptions}
          onConfirm={confirmModal.onConfirm}
          onCancel={closeConfirm}
        />
      )}

      {/* ── Add Admin Modal ────────────────────────── */}
      {showAddAdmin && (
        <AddAdminModal
          onClose={() => setShowAddAdmin(false)}
          onCreated={() => { setShowAddAdmin(false); fetchData(); }}
        />
      )}
      {viewingUser && (
        <UserDetailsModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
        />
      )}
      {viewingAdmin && (
        <AdminDetailsModal
          admin={viewingAdmin}
          onClose={() => setViewingAdmin(null)}
        />
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); fetchData(); }}
        />
      )}
      {editingAdmin && (
        <EditAdminModal
          admin={editingAdmin}
          onClose={() => setEditingAdmin(null)}
          onSaved={() => { setEditingAdmin(null); fetchData(); }}
        />
      )}
    </div>
  );
}
