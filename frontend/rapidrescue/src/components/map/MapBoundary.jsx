import { Polygon } from 'react-leaflet';
import { CABADBARAN_POLYGON } from '../../constants/cabadbaran';

export default function MapBoundary() {
  return (
    <Polygon
      positions={CABADBARAN_POLYGON}
      pathOptions={{
        color: '#2E7D32',
        weight: 3,
        fillColor: '#4CAF50',
        fillOpacity: 0.08,
        dashArray: '8, 6',
      }}
    />
  );
}
