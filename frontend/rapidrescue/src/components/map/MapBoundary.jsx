import { Polygon, Tooltip } from 'react-leaflet';
import { CABADBARAN_POLYGON } from '../../constants/cabadbaran';

export default function MapBoundary({ subtle = false }) {
  return (
    <Polygon
      positions={CABADBARAN_POLYGON}
      pathOptions={{
        color: '#c62828',
        weight: subtle ? 3 : 2.5,
        fillColor: '#c62828',
        fillOpacity: subtle ? 0.05 : 0.08,
        dashArray: '10, 8',
        opacity: 0.95,
      }}
    >
      <Tooltip sticky>
        Cabadbaran City service boundary
      </Tooltip>
    </Polygon>
  );
}
