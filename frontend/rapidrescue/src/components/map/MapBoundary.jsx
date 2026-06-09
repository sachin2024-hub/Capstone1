import { Polygon } from 'react-leaflet';
import { CABADBARAN_POLYGON } from '../../constants/cabadbaran';

export default function MapBoundary({ subtle = false }) {
  return (
    <Polygon
      positions={CABADBARAN_POLYGON}
      pathOptions={
        subtle
          ? {
              color: 'rgba(255,255,255,0.85)',
              weight: 2,
              fillOpacity: 0,
              dashArray: '6, 8',
            }
          : {
              color: '#2E7D32',
              weight: 2,
              fillOpacity: 0,
              dashArray: '8, 6',
            }
      }
    />
  );
}
