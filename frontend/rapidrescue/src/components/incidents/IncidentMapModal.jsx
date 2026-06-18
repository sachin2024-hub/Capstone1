import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CABADBARAN, CABADBARAN_MAX_BOUNDS } from '../../constants/cabadbaran';
import { victimIcon, cityHallIcon } from '../map/mapIcons';
import { parseLocationAddress, formatAreaLabel } from '../../utils/locationFormat';
import MapResizeFix from '../map/MapResizeFix';
import styles from './IncidentMapModal.module.css';

function getIncidentLocation(incident) {
  const loc = Array.isArray(incident?.locations) ? incident.locations[0] : incident?.locations;
  if (!loc?.latitude || !loc?.longitude) return null;

  const parsed = parseLocationAddress(loc.location_address);
  return {
    lat: Number(loc.latitude),
    lng: Number(loc.longitude),
    address: parsed.display || loc.location_address || 'GPS location',
    area: formatAreaLabel(parsed),
    barangay: parsed.barangay,
  };
}

export default function IncidentMapModal({ incident, onClose }) {
  if (!incident) return null;

  const location = getIncidentLocation(incident);
  const reporter = incident.users
    ? `${incident.users.first_name} ${incident.users.last_name}`
    : 'Unknown reporter';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>SOS Location — #{incident.incident_id}</h3>
            <p className={styles.subtitle}>{incident.incident_type}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.infoRow}>
          <span>👤 {reporter}</span>
          {location && (
            <span>📍 {location.area}{location.barangay ? `, Brgy. ${location.barangay}` : ''}</span>
          )}
        </div>

        {!location ? (
          <div className={styles.noLocation}>
            No GPS location saved for this incident.
          </div>
        ) : (
          <div className={styles.mapWrap}>
            <MapContainer
              center={[location.lat, location.lng]}
              zoom={17}
              minZoom={CABADBARAN.minZoom}
              maxZoom={CABADBARAN.maxZoom}
              maxBounds={CABADBARAN_MAX_BOUNDS}
              maxBoundsViscosity={1.0}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Esri"
                maxZoom={19}
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                attribution=""
                maxZoom={19}
              />
              <Marker position={[CABADBARAN.center[0], CABADBARAN.center[1]]} icon={cityHallIcon}>
                <Popup>CDRRMO HQ — Brgy. 9, Cabadbaran City</Popup>
              </Marker>
              <Marker position={[location.lat, location.lng]} icon={victimIcon}>
                <Popup>
                  <strong>SOS / Help location</strong>
                  <br />
                  {reporter}
                  <br />
                  {location.address}
                </Popup>
              </Marker>
              <MapResizeFix />
            </MapContainer>
          </div>
        )}

        {location && (
          <p className={styles.coords}>
            Coordinates: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </p>
        )}
      </div>
    </div>
  );
}
