import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../services/api';
import { CABADBARAN, RESPONDER_STATIONS, CITY_HALL } from '../../constants/cabadbaran';
import { MAP_LAYERS } from '../../constants/mapLayers';
import { isWithinCabadbaran, OUTSIDE_CITY_MESSAGE } from '../../utils/geofence';
import MapBoundary from './MapBoundary';
import MapResizeFix from './MapResizeFix';
import MapInitBounds from './MapInitBounds';
import MapFocusOnClick from './MapFocusOnClick';
import { victimIcon, responderIcon, outsideIcon, cityHallIcon, stationIcon } from './mapIcons';
import { fetchRoute, formatDistance, formatDuration } from './routeService';
import { parseLocationAddress, formatAreaLabel } from '../../utils/locationFormat';
import StreetViewModal from './StreetViewModal';
import Icon from '../common/Icon';
import styles from './LiveMap.module.css';

const DRRMO_HQ = CITY_HALL;

function victimPlaceLabel(inc) {
  if (!inc?.victim) return 'Victim / Help location';
  const parsed = parseLocationAddress(inc.victim.address);
  return formatAreaLabel({
    purok: inc.victim.purok || parsed.purok,
    area: inc.victim.area || parsed.area,
    barangay: inc.victim.barangay || parsed.barangay,
  }) || inc.victim.address || 'Victim / Help location';
}

function stopPopupClick(e) {
  e.preventDefault();
  e.stopPropagation();
  e.nativeEvent?.stopImmediatePropagation?.();
}

export default function LiveMap({ focusIncidentId = null, onViewDetails }) {
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [routes, setRoutes] = useState({});
  const [selectedId, setSelectedId] = useState(focusIncidentId);
  const [loading, setLoading] = useState(true);
  const [outsideAlerts, setOutsideAlerts] = useState([]);
  const [mapLayer, setMapLayer] = useState('hybrid');
  const [layersOpen, setLayersOpen] = useState(false);
  const [mapError, setMapError] = useState('');
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [streetViewTarget, setStreetViewTarget] = useState(null);
  const hasAutoSelected = useRef(false);
  const mapPanelRef = useRef(null);

  const activeLayer = MAP_LAYERS.find((l) => l.id === mapLayer) || MAP_LAYERS[0];
  const isSatelliteView = mapLayer === 'hybrid';

  const loadLive = useCallback(async () => {
    try {
      const res = await api.get('/dispatch/live');
      const data = res.data;
      setLiveIncidents(data);

      const outside = data.filter((inc) => !isWithinCabadbaran(inc.victim.lat, inc.victim.lng));
      setOutsideAlerts(outside);

      if (data.length > 0) {
        setSelectedId((prev) => {
          if (prev && data.some((i) => i.incident_id === prev)) return prev;
          if (!hasAutoSelected.current) {
            hasAutoSelected.current = true;
            return data[0].incident_id;
          }
          return prev;
        });
      }

      const routeMap = {};
      await Promise.all(
        data.map(async (inc) => {
          if (!inc.victim) return;
          const to = { lat: inc.victim.lat, lng: inc.victim.lng };
          const from = inc.responder
            ? { lat: inc.responder.latitude, lng: inc.responder.longitude }
            : { lat: DRRMO_HQ.lat, lng: DRRMO_HQ.lng };
          routeMap[inc.incident_id] = await fetchRoute(from, to);
        })
      );
      setRoutes(routeMap);
      setMapError('');
    } catch (err) {
      console.error('Live map error:', err);
      setMapError(err.message || 'Failed to load live map data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLive();
    const interval = setInterval(loadLive, 8000);
    return () => clearInterval(interval);
  }, [loadLive]);

  useEffect(() => {
    if (!focusIncidentId) return;
    setSelectedId(focusIncidentId);
    setFocusRequestId((n) => n + 1);
    hasAutoSelected.current = true;
  }, [focusIncidentId]);

  useEffect(() => {
    if (!layersOpen) return undefined;
    const close = () => setLayersOpen(false);
    const timer = setTimeout(() => document.addEventListener('click', close), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
    };
  }, [layersOpen]);

  const insideIncidents = liveIncidents.filter((inc) =>
    isWithinCabadbaran(inc.victim.lat, inc.victim.lng)
  );

  const selectedIncident = liveIncidents.find((inc) => inc.incident_id === selectedId);
  const selectedRoute = selectedId ? routes[selectedId] : null;
  const selectedIsOutside = Boolean(
    selectedIncident && !isWithinCabadbaran(selectedIncident.victim.lat, selectedIncident.victim.lng)
  );

  // When a sidebar card is clicked, show only that incident on the map
  const mapIncidents = selectedId
    ? insideIncidents.filter((inc) => inc.incident_id === selectedId)
    : insideIncidents;

  const mapOutsideAlerts = selectedId
    ? outsideAlerts.filter((inc) => inc.incident_id === selectedId)
    : outsideAlerts;

  const focusOnIncident = (incidentId) => {
    setSelectedId(incidentId);
    setFocusRequestId((n) => n + 1);
  };

  const openStreetView = (inc) => {
    if (!inc?.victim) return;
    setStreetViewTarget({
      incidentId: inc.incident_id,
      lat: inc.victim.lat,
      lng: inc.victim.lng,
      label: `#${inc.incident_id} · ${victimPlaceLabel(inc)}`,
    });
  };

  const openDirections = (inc) => {
    if (!inc?.victim) return;
    const origin = inc.responder
      ? `${inc.responder.latitude},${inc.responder.longitude}`
      : `${DRRMO_HQ.lat},${DRRMO_HQ.lng}`;
    const dest = `${inc.victim.lat},${inc.victim.lng}`;
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const renderVictimActions = (inc) => (
    <div className={styles.popupActions}>
      <button
        type="button"
        className={`${styles.popupBtn} ${styles.popupBtnDetails}`}
        onClick={(e) => {
          stopPopupClick(e);
          onViewDetails?.(inc.incident_id);
        }}
      >
        View Details
      </button>
      <button
        type="button"
        className={`${styles.popupBtn} ${styles.popupBtnStreet}`}
        onClick={(e) => {
          stopPopupClick(e);
          openStreetView(inc);
        }}
      >
        View Nearby Street View
      </button>
      <button
        type="button"
        className={`${styles.popupBtn} ${styles.popupBtnDir}`}
        onClick={(e) => {
          stopPopupClick(e);
          openDirections(inc);
        }}
      >
        Directions
      </button>
    </div>
  );

  // Active dispatches for CDRRMO HQ popup — scoped to selected incident
  const activeDispatches = mapIncidents.filter((inc) => inc.responder);

  // Suppress separate responder marker if it's at an already-visible station pin
  const responderAtStation = (inc) => {
    if (!inc.responder) return false;
    return RESPONDER_STATIONS.some(
      (s) =>
        Math.abs(inc.responder.latitude - s.lat) < 0.001 &&
        Math.abs(inc.responder.longitude - s.lng) < 0.001
    );
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      const el = mapPanelRef.current;
      const active = Boolean(
        document.fullscreenElement === el ||
        document.webkitFullscreenElement === el
      );
      setIsExpanded(active);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  const toggleExpand = async () => {
    const el = mapPanelRef.current;
    if (!el) return;

    const active =
      document.fullscreenElement === el || document.webkitFullscreenElement === el;

    try {
      if (active) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else setIsExpanded(false);
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else {
        setIsExpanded((prev) => !prev);
      }
    } catch {
      setIsExpanded((prev) => !prev);
    }
  };

  return (
    <div className={styles.wrapper}>
      {mapError && (
        <div className={styles.mapErrorBanner}>
          <Icon name="warning" size={16} /> {mapError} — Make sure the backend is running on port 5000.
        </div>
      )}
      <div
        ref={mapPanelRef}
        className={`${styles.mapPanel} ${isExpanded ? styles.mapPanelExpanded : ''}`}
      >
        {selectedIsOutside && (
          <div className={styles.outsideBanner}>
            <Icon name="warning" size={16} /> {OUTSIDE_CITY_MESSAGE}
          </div>
        )}

        <MapContainer
          center={CABADBARAN.center}
          zoom={CABADBARAN.defaultZoom}
          minZoom={CABADBARAN.minZoom}
          maxZoom={activeLayer.mapMaxZoom ?? CABADBARAN.maxZoom}
          style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
          className={`${styles.map} ${isSatelliteView ? styles.mapSatellite : ''}`}
        >
          {activeLayer.layers.map((tile, i) => (
            <TileLayer
              key={`${activeLayer.id}-${i}`}
              url={tile.url}
              {...(tile.subdomains ? { subdomains: tile.subdomains } : {})}
              {...(tile.attribution ? { attribution: tile.attribution } : {})}
              {...(tile.maxNativeZoom != null ? { maxNativeZoom: tile.maxNativeZoom } : {})}
              maxZoom={tile.maxZoom}
              opacity={tile.opacity ?? 1}
            />
          ))}
          <MapResizeFix />
          <MapInitBounds />
          {selectedIncident && (
            <MapFocusOnClick
              lat={selectedIncident.victim.lat}
              lng={selectedIncident.victim.lng}
              routePoints={selectedRoute?.points}
              focusId={focusRequestId}
            />
          )}
          <MapBoundary subtle={isSatelliteView} />

          {/* ── CDRRMO HQ ── */}
          <Marker position={[DRRMO_HQ.lat, DRRMO_HQ.lng]} icon={cityHallIcon}>
            <Popup>
              <div style={{ minWidth: 240 }}>
                <strong style={{ fontSize: 14, color: '#b71c1c' }}>🚨 {CITY_HALL.name}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>{CITY_HALL.label}</span>
                <br />
                <span style={{ fontSize: 12, color: '#333' }}>📍 {CITY_HALL.address}</span>
                <br />
                <span style={{ fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>🕐 {CITY_HALL.hours}</span>
                <br />
                <span style={{ fontSize: 11, color: '#888' }}>All dispatches originate from here</span>
                <br />
                <span style={{ fontSize: 11, color: '#aaa' }}>
                  {DRRMO_HQ.lat.toFixed(5)}, {DRRMO_HQ.lng.toFixed(5)}
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

          {/* ── Sub-stations — hidden when one incident is focused ── */}
          {!selectedId && RESPONDER_STATIONS
            .filter((s) => !(s.lat === DRRMO_HQ.lat && s.lng === DRRMO_HQ.lng))
            .map((station) => {
              const dispatchingFrom = insideIncidents.filter(
                (inc) =>
                  inc.responder &&
                  Math.abs(inc.responder.latitude - station.lat) < 0.001 &&
                  Math.abs(inc.responder.longitude - station.lng) < 0.001
              );
              return (
                <Marker key={station.id} position={[station.lat, station.lng]} icon={stationIcon}>
                  <Popup>
                    <div style={{ minWidth: 190 }}>
                      <strong style={{ fontSize: 13, color: '#4a148c' }}>📡 {station.name}</strong>
                      <br />
                      <span style={{ fontSize: 12, color: '#888' }}>DRRMO Sub-Station</span>
                      <br />
                      <span style={{ fontSize: 11, color: '#aaa' }}>
                        {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
                      </span>
                      {dispatchingFrom.length > 0 && (
                        <>
                          <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid #eee' }} />
                          <strong style={{ fontSize: 12, color: '#e53935' }}>
                            🚑 {dispatchingFrom.length} unit(s) dispatching from here
                          </strong>
                          {dispatchingFrom.map((inc) => (
                            <div key={inc.incident_id} style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                              → #{inc.incident_id} · {inc.responder.first_name} {inc.responder.last_name}
                              <span style={{ color: '#e53935', fontWeight: 700 }}>
                                {' '}({inc.dispatch?.dispatch_status || 'En Route'})
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* ── Active incidents with routes (selected only when focused) ── */}
          {mapIncidents.map((inc) => {
            const route = routes[inc.incident_id];
            const isSelected = selectedId === inc.incident_id;
            return (
              <Fragment key={inc.incident_id}>
                {/* Victim marker */}
                <Marker
                  position={[inc.victim.lat, inc.victim.lng]}
                  icon={victimIcon}
                  zIndexOffset={isSelected ? 1000 : 0}
                  eventHandlers={{ click: () => focusOnIncident(inc.incident_id) }}
                >
                  <Popup>
                    <div style={{ minWidth: 220 }}>
                      <strong style={{ fontSize: 14, color: '#b71c1c' }}>🆘 Help Request — #{inc.incident_id}</strong>
                      <br />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {inc.user ? `${inc.user.first_name} ${inc.user.last_name}` : 'Unknown'}
                      </span>
                      {inc.user?.phone_number && (
                        <>
                          <br />
                          <a
                            href={`tel:${inc.user.phone_number}`}
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: '#fff',
                              background: '#2e7d32',
                              padding: '4px 10px',
                              borderRadius: 8,
                              display: 'inline-block',
                              marginTop: 5,
                              textDecoration: 'none',
                            }}
                          >
                            📞 {inc.user.phone_number}
                          </a>
                        </>
                      )}
                      <br />
                      <span style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                        📍 {formatAreaLabel({
                          purok: inc.victim.purok || parseLocationAddress(inc.victim.address).purok,
                          area: inc.victim.area || parseLocationAddress(inc.victim.address).area,
                          barangay: inc.victim.barangay || parseLocationAddress(inc.victim.address).barangay,
                        })}
                      </span>
                      <br />
                      <span style={{ fontSize: 12, color: '#1565c0', fontWeight: 700 }}>
                        🏘️ Barangay {inc.victim.barangay || parseLocationAddress(inc.victim.address).barangay || 'Unknown'}
                      </span>
                      <br />
                      <span style={{ fontSize: 11, color: '#666' }}>
                        {[
                          formatAreaLabel({
                            purok: inc.victim.purok || parseLocationAddress(inc.victim.address).purok,
                            area: inc.victim.area || parseLocationAddress(inc.victim.address).area,
                            barangay: inc.victim.barangay || parseLocationAddress(inc.victim.address).barangay,
                          }),
                          inc.victim.barangay ? `Barangay ${inc.victim.barangay}` : null,
                          inc.victim.city || 'Cabadbaran City',
                        ].filter(Boolean).join(', ')}
                      </span>
                      {route?.isRoad && (
                        <>
                          <br />
                          <span style={{ fontSize: 12, color: '#1565c0', fontWeight: 600 }}>
                            🛣️ ETA: {formatDuration(route.duration)} ({formatDistance(route.distance)})
                          </span>
                        </>
                      )}
                      {renderVictimActions(inc)}
                    </div>
                  </Popup>
                </Marker>

                {/* Responder marker — only if NOT already at a visible station pin */}
                {inc.responder && !responderAtStation(inc) && (
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
                      weight: isSelected ? 7 : 5,
                      opacity: isSelected ? 0.95 : 0.5,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                )}
              </Fragment>
            );
          })}

          {/* ── Outside city alerts — route still drawn past the boundary ── */}
          {mapOutsideAlerts.map((inc) => {
            const route = routes[inc.incident_id];
            const isSelected = selectedId === inc.incident_id;
            return (
              <Fragment key={`out-${inc.incident_id}`}>
                <Marker
                  position={[inc.victim.lat, inc.victim.lng]}
                  icon={outsideIcon}
                  zIndexOffset={isSelected ? 1000 : 0}
                  eventHandlers={{
                    click: () => focusOnIncident(inc.incident_id),
                  }}
                >
                  <Popup>
                    <strong>⚠️ Outside service boundary — #{inc.incident_id}</strong>
                    <br />
                    {inc.user ? `${inc.user.first_name} ${inc.user.last_name}` : 'Unknown user'}
                    <br />
                    {OUTSIDE_CITY_MESSAGE}
                    {route?.isRoad && (
                      <>
                        <br />
                        <span style={{ fontSize: 12, color: '#e65100', fontWeight: 600 }}>
                          🛣️ {formatDistance(route.distance)} · {formatDuration(route.duration)} via road
                        </span>
                      </>
                    )}
                    {renderVictimActions(inc)}
                  </Popup>
                </Marker>

                {inc.responder && !responderAtStation(inc) && (
                  <Marker
                    position={[inc.responder.latitude, inc.responder.longitude]}
                    icon={responderIcon}
                  >
                    <Popup>
                      <strong>
                        🚑 {inc.responder.first_name} {inc.responder.last_name}
                      </strong>
                      <br />
                      {inc.responder.responder_type}
                    </Popup>
                  </Marker>
                )}

                {route?.points && (
                  <Polyline
                    positions={route.points}
                    pathOptions={{
                      color: isSelected ? '#EF6C00' : '#ffcc80',
                      weight: isSelected ? 7 : 5,
                      opacity: isSelected ? 0.95 : 0.5,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                )}
              </Fragment>
            );
          })}
        </MapContainer>

        <button
          type="button"
          className={styles.expandBtn}
          onClick={toggleExpand}
          title={isExpanded ? 'Exit full screen' : 'Expand map'}
        >
          {isExpanded ? '⛶ Exit' : '⛶ Expand'}
        </button>

        {/* Map Legend */}
        <div className={styles.legend}>
          <div className={styles.legendTitle}>Map Legend</div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#e53935' }} />
            Victim / Help
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#1565c0' }} />
            Responder (DRRMO)
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#f9a825' }} />
            CDRRMO HQ
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#6a1b9a' }} />
            Dispatch Stations
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#e65100' }} />
            Outside boundary
          </div>
        </div>

        {loading && liveIncidents.length === 0 && (
          <div className={styles.mapOverlay}>
            <div className={styles.loader} />
            <p>Waiting for help alerts...</p>
          </div>
        )}

        {/* Google-style layer picker */}
        <div
          className={`${styles.layerPanel} ${layersOpen ? styles.layerPanelOpen : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {layersOpen ? (
            <div className={styles.layerGrid}>
              {MAP_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={`${styles.layerCard} ${mapLayer === layer.id ? styles.layerCardActive : ''}`}
                  onClick={() => {
                    setMapLayer(layer.id);
                    setLayersOpen(false);
                  }}
                >
                  <span className={`${styles.layerThumb} ${styles[`thumb_${layer.preview}`]}`} />
                  <span className={styles.layerCardLabel}>{layer.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className={styles.layerToggle}
              onClick={() => setLayersOpen(true)}
              title="Change map layer"
            >
              <span className={`${styles.layerThumb} ${styles[`thumb_${activeLayer.preview}`]}`} />
              <span className={styles.layerToggleLabel}>Layers</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Side Panel ────────────────────────────────── */}
      <div className={styles.sidePanel}>
        {/* DRRMO Info Card */}
        <div className={styles.drrmoCard}>
          <div className={styles.drrmoCardHeader}>
            <span className={styles.drrmoIcon}><Icon name="emergency" size={20} /></span>
            <div>
              <div className={styles.drrmoName}>CDRRMO — Cabadbaran City</div>
              <div className={styles.drrmoSub}>{CITY_HALL.address}</div>
            </div>
          </div>
          <div className={styles.drrmoStats}>
            <div className={styles.drrmStatItem}>
              <span className={styles.drrmStatVal}>{RESPONDER_STATIONS.length}</span>
              <span className={styles.drrmStatLabel}>Stations</span>
            </div>
            <div className={styles.drrmStatItem}>
              <span className={styles.drrmStatVal}>{liveIncidents.length}</span>
              <span className={styles.drrmStatLabel}>Active Help</span>
            </div>
            <div className={styles.drrmStatItem}>
              <span className={styles.drrmStatVal}>24/7</span>
              <span className={styles.drrmStatLabel}>Service</span>
            </div>
          </div>
        </div>

        <h3 className={styles.sideTitle}><Icon name="emergency" size={18} /> Active Help Alerts</h3>
        {liveIncidents.length === 0 ? (
          <div className={styles.emptyBox}>
            <div className={styles.emptyIcon}><Icon name="cell_tower" size={36} /></div>
            <p className={styles.emptyText}>No active help alerts.</p>
            <p className={styles.emptyHint}>Press Help on the mobile app inside Cabadbaran City to trigger a response.</p>
          </div>
        ) : (
          liveIncidents.map((inc) => {
            const outside = !isWithinCabadbaran(inc.victim.lat, inc.victim.lng);
            const route = routes[inc.incident_id];
            const parsed = parseLocationAddress(inc.victim.address);
            const loc = {
              purok: inc.victim.purok || parsed.purok,
              area: inc.victim.area || parsed.area,
              barangay: inc.victim.barangay || parsed.barangay,
            };
            return (
              <button
                type="button"
                key={inc.incident_id}
                className={`${styles.alertCard} ${selectedId === inc.incident_id ? styles.alertCardActive : ''} ${outside ? styles.alertCardOutside : ''}`}
                onClick={() => focusOnIncident(inc.incident_id)}
              >
                <div className={styles.alertHeader}>
                  <span className={styles.alertId}>#{inc.incident_id}</span>
                  <span className={outside ? styles.alertOutside : styles.alertStatus}>
                    {outside ? '⚠️ Outside' : inc.incident_status}
                  </span>
                </div>
                <div className={styles.alertUserRow}>
                  <p className={styles.alertUser}>
                    👤 {inc.user ? `${inc.user.first_name} ${inc.user.last_name}` : 'Unknown user'}
                  </p>
                  {inc.user?.phone_number && (
                    <a
                      href={`tel:${inc.user.phone_number}`}
                      className={styles.callBtn}
                      onClick={(e) => e.stopPropagation()}
                      title={`Call ${inc.user.first_name}`}
                    >
                      📞 {inc.user.phone_number}
                    </a>
                  )}
                </div>
                {!outside && (
                  <div className={styles.alertLocation}>
                    <p className={styles.alertPurok}>
                      📍 {formatAreaLabel(loc)}
                    </p>
                    <p className={styles.alertBarangay}>
                      🏘️ Barangay {loc.barangay || 'Unknown'}
                    </p>
                  </div>
                )}
                {outside ? (
                  <>
                    <p className={styles.alertOutsideText}>{OUTSIDE_CITY_MESSAGE}</p>
                    {route?.isRoad && (
                      <p className={styles.alertRoute}>
                        🛣️ {formatDistance(route.distance)} · {formatDuration(route.duration)} via road
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {inc.responder ? (
                      <>
                        <p className={styles.alertResponder}>
                          🚑 {inc.responder.first_name} {inc.responder.last_name} — {inc.responder.responder_type}
                        </p>
                        <p className={styles.alertStation}>
                          🏢 From: {inc.responder.station_name || 'DRRMO Headquarters'}
                        </p>
                      </>
                    ) : (
                      <p className={styles.alertNoResponder}>
                        ⏳ Waiting for responder dispatch...
                      </p>
                    )}
                    <p className={styles.alertRoute}>
                      {route?.isRoad
                        ? `🛣️ ${formatDistance(route.distance)} · ${formatDuration(route.duration)} via road`
                        : route?.points
                          ? '⏳ Calculating road route...'
                          : '⏳ Loading route...'}
                    </p>
                  </>
                )}
                {selectedId === inc.incident_id && (
                  <span
                    className={styles.alertStreetBtn}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openStreetView(inc);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        openStreetView(inc);
                      }
                    }}
                  >
                    🚶 Street View
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {streetViewTarget && (
        <StreetViewModal
          target={streetViewTarget}
          onClose={() => setStreetViewTarget(null)}
          portalTarget={isExpanded ? mapPanelRef.current : null}
        />
      )}
    </div>
  );
}
