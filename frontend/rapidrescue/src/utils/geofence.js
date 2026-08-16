import { CABADBARAN_POLYGON } from '../constants/cabadbaran';

export const OUTSIDE_CITY_MESSAGE =
  'Outside the service boundary. Please wait while we refer you to the nearest ambulance.';

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0];
    const xi = polygon[i][1];
    const yj = polygon[j][0];
    const xj = polygon[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isWithinCabadbaran(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  return pointInPolygon(nLat, nLng, CABADBARAN_POLYGON);
}
