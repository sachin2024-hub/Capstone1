import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export default function MapFocusOnClick({ lat, lng, routePoints, focusId }) {
  const map = useMap();
  const lastFocusId = useRef(0);

  useEffect(() => {
    if (!focusId || focusId === lastFocusId.current) return;
    if (lat == null || lng == null) return;

    lastFocusId.current = focusId;

    if (routePoints?.length > 1) {
      map.fitBounds(L.latLngBounds(routePoints), { padding: [60, 60], maxZoom: 16 });
    } else {
      map.flyTo([lat, lng], 16, { duration: 0.5 });
    }
  }, [map, lat, lng, routePoints, focusId]);

  return null;
}
