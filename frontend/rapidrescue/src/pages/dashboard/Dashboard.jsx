import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, getStoredAdmin } from '../../services/authService';
import api from '../../services/api';
import LiveMap from '../../components/map/LiveMap';
import IncidentStatusModal from '../../components/incidents/IncidentStatusModal';
import { STATUS_COLORS, DISPATCH_COLORS } from '../../constants/statusColors';
import { formatDate } from '../../utils/formatDate';
import styles from './Dashboard.module.css';

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
  { id: 'responders', icon: '🚑', label: 'Responders' },
  { id: 'dispatch',   icon: '📡', label: 'Dispatch' },
  { id: 'users',      icon: '👥', label: 'Users' },
];

const STAT_COLORS = ['statRed', 'statOrange', 'statBlue', 'statYellow', 'statGreen', 'statPurple'];

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
          {activeTab === 'live-map' && <LiveMap />}

          {/* ── INCIDENTS ────────────────────────────────── */}
          {activeTab === 'incidents' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>All Incidents</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
              </div>
              <div className={styles.tableCard}>
                {isLoading ? <TableLoader /> : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>ID</th><th>Type</th><th>Description</th><th>Reporter</th>
                          <th>Location</th><th>Status</th><th>Priority</th><th>Date</th><th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.map((inc) => {
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
                                {loc ? (loc.location_address || `${loc.latitude?.toFixed(4)}, ${loc.longitude?.toFixed(4)}`) : '—'}
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
                              <td>
                                <button
                                  type="button"
                                  className={styles.editBtn}
                                  onClick={() => setEditingIncident(inc)}
                                >
                                  ✏️ Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {incidents.length === 0 && (
                          <tr><td colSpan={9} className={styles.emptyRow}>📭 No incidents yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── RESPONDERS ───────────────────────────────── */}
          {activeTab === 'responders' && (
            <div>
              <div className={styles.tabHeader}>
                <h2 className={styles.sectionTitle}>Responders</h2>
                <button className={styles.refreshBtn} onClick={fetchData}>🔄 Refresh</button>
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
                              <button className={styles.smallBtn} onClick={() => setActiveTab('live-map')}>
                                🗺️ View Map
                              </button>
                            </td>
                          </tr>
                        ))}
                        {responders.length === 0 && (
                          <tr><td colSpan={6} className={styles.emptyRow}>📭 No responders yet. Add responders in Supabase.</td></tr>
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
    </div>
  );
}
