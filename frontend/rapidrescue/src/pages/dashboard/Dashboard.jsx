import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, getStoredAdmin } from '../../services/authService';
import api from '../../services/api';
import LiveMap from '../../components/map/LiveMap';
import IncidentStatusModal from '../../components/incidents/IncidentStatusModal';
import ResponderModal from '../../components/responders/ResponderModal';
import CallLogPage from '../../components/calllog/CallLogPage';
import { archiveIncident, deleteIncident, permanentDeleteIncident } from '../../services/incidentService';
import { deleteResponder } from '../../services/responderService';
import { STATUS_COLORS, DISPATCH_COLORS } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import { parseLocationAddress, formatAreaLabel } from '../../utils/locationFormat';
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

const NAV_ITEMS = [
  { id: 'overview',   icon: '📊', label: 'Overview' },
  { id: 'live-map',   icon: '🗺️', label: 'Live Map' },
  { id: 'incidents',  icon: '🚨', label: 'Incidents' },
  { id: 'archive',    icon: '📁', label: 'Archive' },
  { id: 'responders', icon: '🚑', label: 'Responders' },
  { id: 'dispatch',   icon: '📡', label: 'Dispatch' },
  { id: 'call-log',   icon: '📋', label: 'Call Log' },
  { id: 'users',      icon: '👥', label: 'Users' },
  { id: 'settings',   icon: '⚙️', label: 'Settings' },
];

const STAT_COLORS = ['statRed', 'statOrange', 'statBlue', 'statYellow', 'statGreen', 'statPurple'];

const INCIDENT_FILTER_TABS = [
  { id: 'pending', icon: '⏳', label: 'Pending' },
  { id: 'active', icon: '🚑', label: 'Active Response' },
  { id: 'resolved', icon: '✅', label: 'Resolved' },
  { id: 'cancelled', icon: '❌', label: 'Cancelled' },
];

const ARCHIVE_FILTER_TABS = [
  { id: 'archived', icon: '📁', label: 'Archived' },
  { id: 'deleted', icon: '🗑️', label: 'Deleted' },
];

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
  actions = {},
  hideTitle = false,
}) {
  const {
    edit = true,
    archive = false,
    delete: showDelete = true,
    permanentDelete = false,
  } = actions;
  const hasActions = edit || archive || showDelete || permanentDelete;

  return (
    <div className={styles.incidentSection}>
      {!hideTitle && (
        <h3 className={styles.incidentSectionTitle}>
          <span>{icon} {title}</span>
          <span className={styles.incidentCount}>{rows.length}</span>
        </h3>
      )}
      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadingBox}>
            <div className={styles.loader} />
            <span>Loading data...</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th><th>Type</th><th>Description</th><th>Reporter</th>
                  <th>Location</th><th>Status</th><th>Priority</th><th>Date</th>
                  {hasActions && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((inc) => {
                  const loc = Array.isArray(inc.locations) ? inc.locations[0] : inc.locations;
                  return (
                    <tr key={inc.incident_id}>
                      <td><strong>#{inc.incident_id}</strong></td>
                      <td>{inc.incident_type}</td>
                      <td className={styles.descCell}>{inc.incident_description || '—'}</td>
                      <td>
                        {inc.users
                          ? `${inc.users.first_name} ${inc.users.last_name}`
                          : <span style={{ color: '#bbb' }}>—</span>}
                      </td>
                      <td className={styles.descCell} style={{ color: '#888', fontSize: 12 }}>
                        {formatLocation(loc)}
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
                        <td>
                          <div className={styles.actionGroup}>
                            {edit && (
                              <button type="button" className={styles.editBtn} onClick={() => onEdit(inc)}>
                                ✏️ Edit
                              </button>
                            )}
                            {archive && (
                              <button type="button" className={styles.archiveBtn} onClick={() => onArchive(inc)}>
                                📁 Archive
                              </button>
                            )}
                            {showDelete && (
                              <button type="button" className={styles.deleteBtn} onClick={() => onDelete(inc)}>
                                🗑️ Delete
                              </button>
                            )}
                            {permanentDelete && (
                              <button type="button" className={styles.deleteBtn} onClick={() => onPermanentDelete(inc)}>
                                🗑️ Remove Forever
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={hasActions ? 9 : 8} className={styles.emptyRow}>{emptyMessage}</td>
                  </tr>
                )}
              </tbody>
            </table>
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
  const [activeTab, setActiveTab] = useState('overview');
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
  const [responderModal, setResponderModal] = useState(null);
  const [incidentFilter, setIncidentFilter] = useState('pending');
  const [archiveFilter, setArchiveFilter] = useState('archived');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError('');
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
    } catch (err) {
      setError(err.message || 'Failed to load data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pendingIncidents = incidents.filter((i) => i.incident_status === 'Pending');
  const activeResponseIncidents = incidents.filter((i) => ACTIVE_RESPONSE_STATUSES.includes(i.incident_status));
  const resolvedIncidents = incidents.filter((i) => i.incident_status === 'Resolved');
  const cancelledIncidents = incidents.filter((i) => i.incident_status === 'Cancelled');
  const archivedIncidents = incidents.filter((i) => i.incident_status === 'Archived');
  const deletedIncidents = incidents.filter((i) => i.incident_status === 'Deleted');
  const ongoingIncidents = incidents.filter((i) => ONGOING_STATUSES.includes(i.incident_status));

  const incidentFilterCounts = {
    pending: pendingIncidents.length,
    active: activeResponseIncidents.length,
    resolved: resolvedIncidents.length,
    cancelled: cancelledIncidents.length,
  };

  const archiveFilterCounts = {
    archived: archivedIncidents.length,
    deleted: deletedIncidents.length,
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

  const handleDelete = async (inc) => {
    if (!window.confirm(`Move incident #${inc.incident_id} to Archive → Deleted?`)) return;
    try {
      await deleteIncident(inc.incident_id);
      await fetchData();
      setActiveTab('archive');
      setArchiveFilter('deleted');
    } catch (err) {
      setError(err.message || 'Failed to delete incident.');
    }
  };

  const handlePermanentDelete = async (inc) => {
    if (!window.confirm(`Permanently remove incident #${inc.incident_id}? This cannot be undone.`)) return;
    try {
      await permanentDeleteIncident(inc.incident_id);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to permanently remove incident.');
    }
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
          <div className={styles.sidebarLogo}>✚</div>
          {sidebarOpen && <span className={styles.sidebarAppName}>RapidRescue</span>}
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
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
        </nav>

        <div className={styles.sidebarFooter}>
          <button className={styles.logoutBtn} onClick={handleLogout} title={!sidebarOpen ? 'Sign Out' : undefined}>
            <span className={styles.navIcon}>🚪</span>
            {sidebarOpen && <span>Sign Out</span>}
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
        <div className={`${styles.content} ${activeTab === 'live-map' ? styles.contentMap : ''}`}>
          {error && (
            <div className={styles.errorBanner}>
              <span>⚠️ {error}</span>
              <button onClick={fetchData} className={styles.retryBtn}>🔄 Retry</button>
            </div>
          )}

          {/* ── OVERVIEW ────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Dashboard Overview</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>
                  🔄 Refresh
                </button>
              </div>

              {/* Banner */}
              <div className={styles.overviewBanner}>
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
          {activeTab === 'live-map' && <LiveMap key="live-map" />}

          {/* ── INCIDENTS ────────────────────────────────── */}
          {activeTab === 'incidents' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Incidents</h2>
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
                <h2 className={styles.sectionTitle}>Incident Archive</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
              </div>

              <div className={styles.incidentFilterBar}>
                {ARCHIVE_FILTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.incidentFilterBtn} ${archiveFilter === tab.id ? styles.incidentFilterBtnActive : ''}`}
                    onClick={() => setArchiveFilter(tab.id)}
                  >
                    <span>{tab.icon} {tab.label}</span>
                    <span className={styles.incidentFilterBadge}>{archiveFilterCounts[tab.id]}</span>
                  </button>
                ))}
              </div>

              <p className={styles.archiveHint}>
                {archiveFilter === 'archived'
                  ? 'Manually archived incidents. Use Delete to move them to the Deleted table.'
                  : 'Deleted incidents are kept here. Use Remove Forever to permanently erase.'}
              </p>

              {archiveFilter === 'archived' && (
                <IncidentTableSection
                  title="Archived"
                  icon="📁"
                  rows={archivedIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No archived incidents yet."
                  onEdit={setEditingIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  actions={{ edit: false, archive: false, delete: true }}
                  hideTitle
                />
              )}

              {archiveFilter === 'deleted' && (
                <IncidentTableSection
                  title="Deleted"
                  icon="🗑️"
                  rows={deletedIncidents}
                  isLoading={isLoading}
                  emptyMessage="📭 No deleted incidents yet."
                  onEdit={setEditingIncident}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onPermanentDelete={handlePermanentDelete}
                  actions={{ edit: false, archive: false, delete: false, permanentDelete: true }}
                  hideTitle
                />
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
          {activeTab === 'dispatch' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Dispatch Log</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
              </div>
              <div className={styles.tableCard}>
                {isLoading ? <TableLoader /> : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>ID</th><th>Incident</th><th>Responder</th>
                          <th>Status</th><th>Dispatch Time</th><th>Arrival</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dispatches.map((d) => (
                          <tr key={d.dispatch_id}>
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
                              {d.responders
                                ? (
                                  <div className={styles.userCell}>
                                    <div className={styles.userAvatar}>{d.responders.first_name?.charAt(0)}</div>
                                    <div>
                                      <span className={styles.userName2}>{d.responders.first_name} {d.responders.last_name}</span>
                                      <span className={styles.subText}>{d.responders.responder_type}</span>
                                    </div>
                                  </div>
                                )
                                : <span style={{ color: '#bbb' }}>—</span>}
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
                        {dispatches.length === 0 && (
                          <tr><td colSpan={6} className={styles.emptyRow}>📭 No dispatches yet. Press SOS on mobile to trigger.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

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

      {responderModal && (
        <ResponderModal
          responder={responderModal.mode === 'edit' ? responderModal.responder : null}
          onClose={() => setResponderModal(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
