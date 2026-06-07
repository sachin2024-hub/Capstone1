import { useEffect, useState, useCallback, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../services/api';
import { CABADBARAN, CABADBARAN_MAX_BOUNDS, RESPONDER_STATIONS } from '../../constants/cabadbaran';
import { isWithinCabadbaran, OUTSIDE_CITY_MESSAGE } from '../../utils/geofence';
import MapBoundary from './MapBoundary';
import { victimIcon, responderIcon, outsideIcon, drrmoIcon, stationIcon } from './mapIcons';
import { fetchRoute, formatDistance, formatDuration } from './routeService';
import styles from './LiveMap.module.css';

// DRRMO HQ — main admin headquarters
const DRRMO_HQ = {
  name: 'DRRMO Headquarters',
  label: 'Cabadbaran City DRRMO',
  lat: 9.1226,
  lng: 125.5344,
};

function MapFitCabadbaran() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLngBounds(CABADBARAN_MAX_BOUNDS), { padding: [20, 20] });
    map.setMaxBounds(CABADBARAN_MAX_BOUNDS);
  }, [map]);
  return null;
}

function MapFocusRoute({ routePoints, incidentId, selectedId }) {
  const map = useMap();
  useEffect(() => {
    if (incidentId === selectedId && routePoints?.length > 1) {
      map.fitBounds(L.latLngBounds(routePoints), { padding: [60, 60], maxZoom: 15 });
    }
  }, [map, routePoints, incidentId, selectedId]);
  return null;
}

export default function LiveMap() {
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [routes, setRoutes] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [outsideAlerts, setOutsideAlerts] = useState([]);

  const loadLive = useCallback(async () => {
    try {
      const res = await api.get('/dispatch/live');
      const data = res.data;
      setLiveIncidents(data);

      const outside = data.filter((inc) => !isWithinCabadbaran(inc.victim.lat, inc.victim.lng));
      setOutsideAlerts(outside);

      if (data.length > 0) {
        setSelectedId((prev) => prev ?? data[0].incident_id);
      }

      const routeMap = {};
      await Promise.all(
        data
          .filter((inc) => isWithinCabadbaran(inc.victim.lat, inc.victim.lng))
          .map(async (inc) => {
            if (inc.responder && inc.victim) {
              const from = { lat: inc.responder.latitude, lng: inc.responder.longitude };
              const to   = { lat: inc.victim.lat, lng: inc.victim.lng };
              routeMap[inc.incident_id] = await fetchRoute(from, to);
            }
          })
      );
      setRoutes(routeMap);
    } catch (err) {
      console.error('Live map error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLive();
    const interval = setInterval(loadLive, 8000);
    return () => clearInterval(interval);
  }, [loadLive]);

  const insideIncidents = liveIncidents.filter((inc) =>
    isWithinCabadbaran(inc.victim.lat, inc.victim.lng)
  );

  // Active dispatches for DRRMO HQ popup info
  const activeDispatches = insideIncidents.filter((inc) => inc.responder);

  // Responder is always at DRRMO HQ now — no separate blue marker needed at HQ
  // (the green DRRMO marker will show dispatch info in its popup)
  const responderAtHQ = (inc) =>
    inc.responder &&
    Math.abs(inc.responder.latitude - DRRMO_HQ.lat) < 0.001 &&
    Math.abs(inc.responder.longitude - DRRMO_HQ.lng) < 0.001;

  return (
    <div className={styles.wrapper}>
      <div className={styles.mapPanel}>
        {outsideAlerts.length > 0 && (
          <div className={styles.outsideBanner}>
            ⚠️ {outsideAlerts.length} alert(s) naka-lapas sa Cabadbaran City!
          </div>
        )}

        <MapContainer
          center={CABADBARAN.center}
          zoom={CABADBARAN.defaultZoom}
          minZoom={CABADBARAN.minZoom}
          maxZoom={CABADBARAN.maxZoom}
          maxBounds={CABADBARAN_MAX_BOUNDS}
          maxBoundsViscosity={1.0}
          className={styles.map}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapFitCabadbaran />
          <MapBoundary />

          {/* ── DRRMO HQ — always visible, shows dispatch status ── */}
          <Marker position={[DRRMO_HQ.lat, DRRMO_HQ.lng]} icon={drrmoIcon}>
            <Popup>
              <div style={{ minWidth: 200 }}>
                <strong style={{ fontSize: 14, color: '#1b5e20' }}>🏢 {DRRMO_HQ.name}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#555' }}>{DRRMO_HQ.label}</span>
                <br />
                <span style={{ fontSize: 12, color: '#888' }}>Admin HQ · Dispatch Center</span>
                <br />
                <span style={{ fontSize: 11, color: '#aaa' }}>
                  {DRRMO_HQ.lat.toFixed(4)}, {DRRMO_HQ.lng.toFixed(4)}
                </span>
                {activeDispatches.length > 0 && (
                  <>
                    <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #eee' }} />
                    <strong style={{ fontSize: 12, color: '#1565c0' }}>
                      🚑 {activeDispatches.length} Responder(s) En Route
                    </strong>
                    {activeDispatches.map((inc) => (
                      <div key={inc.incident_id} style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                        → #{inc.incident_id} · {inc.responder.first_name} {inc.responder.last_name}
                        <span style={{ color: '#e53935', fontWeight: 700 }}>
                          {' '}({inc.dispatch?.dispatch_status || 'En Route'})
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {activeDispatches.length === 0 && (
                  <>
                    <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #eee' }} />
                    <span style={{ fontSize: 11, color: '#4caf50', fontWeight: 600 }}>
                      ✅ All units on standby
                    </span>
                  </>
                )}
              </div>
            </Popup>
          </Marker>

          {/* ── Other dispatch stations — always visible ── */}
          {RESPONDER_STATIONS
            .filter((s) => !(s.lat === DRRMO_HQ.lat && s.lng === DRRMO_HQ.lng))
            .map((station) => (
              <Marker key={station.id} position={[station.lat, station.lng]} icon={stationIcon}>
                <Popup>
                  <div style={{ minWidth: 160 }}>
                    <strong style={{ fontSize: 13, color: '#4a148c' }}>📡 {station.name}</strong>
                    <br />
                    <span style={{ fontSize: 12, color: '#888' }}>DRRMO Sub-Station</span>
                    <br />
                    <span style={{ fontSize: 11, color: '#aaa' }}>
                      {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* ── Active incidents with routes ─────────────── */}
          {insideIncidents.map((inc) => {
            const route = routes[inc.incident_id];
            const isSelected = selectedId === inc.incident_id;
            return (
              <Fragment key={inc.incident_id}>
                {route?.points?.length > 1 && (
                  <MapFocusRoute
                    routePoints={route.points}
                    incidentId={inc.incident_id}
                    selectedId={selectedId}
                  />
                )}

                {/* Victim marker */}
                <Marker position={[inc.victim.lat, inc.victim.lng]} icon={victimIcon}>
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <strong style={{ fontSize: 14, color: '#b71c1c' }}>🆘 Victim — #{inc.incident_id}</strong>
                      <br />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {inc.user ? `${inc.user.first_name} ${inc.user.last_name}` : 'Unknown'}
                      </span>
                      <br />
                      <span style={{ fontSize: 12, color: '#666' }}>
                        {inc.victim.address || 'SOS Location'}
                      </span>
                      {route?.isRoad && (
                        <>
                          <br />
                          <span style={{ fontSize: 12, color: '#1565c0', fontWeight: 600 }}>
                            🛣️ ETA: {formatDuration(route.duration)} ({formatDistance(route.distance)})
                          </span>
                        </>
                      )}
                    </div>
                  </Popup>
                </Marker>

                {/* Responder marker — only if NOT at DRRMO HQ (no duplicate) */}
                {inc.responder && !responderAtHQ(inc) && (
                  <Marker
                    position={[inc.responder.latitude, inc.responder.longitude]}
                    icon={responderIcon}
                  >
                    <Popup>
                      <div style={{ minWidth: 180 }}>
                        <strong style={{ fontSize: 13, color: '#0d47a1' }}>
                          🚑 {inc.responder.first_name} {inc.responder.last_name}
                        </strong>
                        <br />
                        <span style={{ fontSize: 12, color: '#555' }}>
                          {inc.responder.responder_type}
                        </span>
                        <br />
                        <span style={{ fontSize: 12, color: '#1b5e20', fontWeight: 600 }}>
                          📍 {inc.responder.station_name || 'DRRMO Dispatch Station'}
                        </span>
                        <br />
                        <span style={{ fontSize: 12, color: '#888' }}>
                          Status: <strong>{inc.dispatch?.dispatch_status || 'En Route'}</strong>
                        </span>
                        {route?.isRoad && (
                          <>
                            <br />
                            <span style={{ fontSize: 12, color: '#1565c0', fontWeight: 600 }}>
                              🛣️ {formatDistance(route.distance)} · {formatDuration(route.duration)}
                            </span>
                          </>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Route polyline */}
                {route?.points && (
                  <Polyline
                    positions={route.points}
                    pathOptions={{
                      color: isSelected ? '#E53935' : '#ef9a9a',
                      weight: isSelected ? 6 : 4,
                      opacity: isSelected ? 0.95 : 0.5,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                )}
              </Fragment>
            );
          })}

          {/* ── Outside city alerts ───────────────────── */}
          {outsideAlerts.map((inc) => (
            <Marker
              key={`out-${inc.incident_id}`}
              position={[inc.victim.lat, inc.victim.lng]}
              icon={outsideIcon}
            >
              <Popup>
                <strong>⚠️ Outside City — #{inc.incident_id}</strong>
                <br />
                {OUTSIDE_CITY_MESSAGE}
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Map badges */}
        <div className={styles.liveBadge}>● LIVE</div>
        <div className={styles.cityBadge}>📍 Cabadbaran City Only</div>

        {/* Map Legend */}
        <div className={styles.legend}>
          <div className={styles.legendTitle}>Map Legend</div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#e53935' }} />
            Victim / SOS
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#1565c0' }} />
            Responder (DRRMO)
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#2e7d32' }} />
            DRRMO Headquarters
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#6a1b9a' }} />
            Dispatch Stations
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#e65100' }} />
            Outside City
          </div>
        </div>

        {loading && liveIncidents.length === 0 && (
          <div className={styles.mapOverlay}>
            <div className={styles.loader} />
            <p>Waiting for SOS alerts...</p>
          </div>
        )}
      </div>

      {/* ── Side Panel ────────────────────────────────── */}
      <div className={styles.sidePanel}>
        {/* DRRMO Info Card */}
        <div className={styles.drrmoCard}>
          <div className={styles.drrmoCardHeader}>
            <span className={styles.drrmoIcon}>🏢</span>
            <div>
              <div className={styles.drrmoName}>DRRMO Headquarters</div>
              <div className={styles.drrmoSub}>Cabadbaran City, Agusan del Norte</div>
            </div>
          </div>
          <div className={styles.drrmoStats}>
            <div className={styles.drrmStatItem}>
              <span className={styles.drrmStatVal}>{RESPONDER_STATIONS.length}</span>
              <span className={styles.drrmStatLabel}>Stations</span>
            </div>
            <div className={styles.drrmStatItem}>
              <span className={styles.drrmStatVal}>{liveIncidents.length}</span>
              <span className={styles.drrmStatLabel}>Active SOS</span>
            </div>
            <div className={styles.drrmStatItem}>
              <span className={styles.drrmStatVal}>24/7</span>
              <span className={styles.drrmStatLabel}>Service</span>
            </div>
          </div>
        </div>

        <h3 className={styles.sideTitle}>🚨 Active SOS Alerts</h3>
        {liveIncidents.length === 0 ? (
          <div className={styles.emptyBox}>
            <div className={styles.emptyIcon}>📡</div>
            <p className={styles.emptyText}>No active SOS alerts.</p>
            <p className={styles.emptyHint}>Press SOS on the mobile app inside Cabadbaran City to trigger a response.</p>
          </div>
        ) : (
          liveIncidents.map((inc) => {
            const outside = !isWithinCabadbaran(inc.victim.lat, inc.victim.lng);
            const route = routes[inc.incident_id];
            return (
              <button
                key={inc.incident_id}
                className={`${styles.alertCard} ${selectedId === inc.incident_id ? styles.alertCardActive : ''} ${outside ? styles.alertCardOutside : ''}`}
                onClick={() => setSelectedId(inc.incident_id)}
              >
                <div className={styles.alertHeader}>
                  <span className={styles.alertId}>#{inc.incident_id}</span>
                  <span className={outside ? styles.alertOutside : styles.alertStatus}>
                    {outside ? '⚠️ Outside' : inc.incident_status}
                  </span>
                </div>
                <p className={styles.alertUser}>
                  👤 {inc.user ? `${inc.user.first_name} ${inc.user.last_name}` : 'Unknown user'}
                </p>
                {outside ? (
                  <p className={styles.alertOutsideText}>{OUTSIDE_CITY_MESSAGE}</p>
                ) : (
                  <>
                    {inc.responder && (
                      <p className={styles.alertResponder}>
                        🚑 {inc.responder.first_name} {inc.responder.last_name} — {inc.responder.responder_type}
                      </p>
                    )}
                    {inc.responder && (
                      <p className={styles.alertStation}>
                        🏢 From: {inc.responder.station_name || 'DRRMO Headquarters'}
                      </p>
                    )}
                    <p className={styles.alertRoute}>
                      {route?.isRoad
                        ? `🛣️ ${formatDistance(route.distance)} · ${formatDuration(route.duration)} via road`
                        : route
                          ? '⏳ Calculating road route...'
                          : '⏳ Waiting for route...'}
                    </p>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
