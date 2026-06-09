import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { CABADBARAN_MAX_BOUNDS } from '../../constants/cabadbaran';

export default function MapInitBounds() {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    map.setMaxBounds(CABADBARAN_MAX_BOUNDS);
    map.invalidateSize({ animate: false });
  }, [map]);

  return null;
}
