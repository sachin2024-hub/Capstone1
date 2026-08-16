import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { CABADBARAN_POLYGON } from '../../constants/cabadbaran';

export default function MapInitBounds() {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    map.setMaxBounds(null);
    map.fitBounds(CABADBARAN_POLYGON, { padding: [28, 28], maxZoom: 13 });
    map.invalidateSize({ animate: false });
  }, [map]);

  return null;
}
