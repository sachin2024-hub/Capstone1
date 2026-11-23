import { MapContainer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import VectorBasemapLayer from '../map/VectorBasemapLayer';
import MapResizeFix from '../map/MapResizeFix';
import { victimIcon } from '../map/mapIcons';
import Icon from '../common/Icon';
import styles from './IncidentMiniMap.module.css';

/**
 * Small street map of where help was requested. The whole box is a button: clicking it opens the
 * Live Map focused on this request (route + street map). The map itself is not interactive, so a
 * click never gets swallowed by dragging or zooming.
 */
export default function IncidentMiniMap({ lat, lng, onOpen }) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return (
    <button type="button" className={styles.box} onClick={onOpen} aria-label="Open this request on the Live Map">
      <MapContainer
        center={[la, ln]}
        zoom={16}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        className={styles.map}
      >
        <VectorBasemapLayer maxZoom={19} />
        <MapResizeFix />
        <Marker position={[la, ln]} icon={victimIcon} interactive={false} />
      </MapContainer>
      <span className={styles.cta}>
        <Icon name="map" size={16} /> Open on Live Map · see route
      </span>
    </button>
  );
}
