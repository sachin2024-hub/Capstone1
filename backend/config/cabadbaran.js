// CDRRMO — City Disaster Risk Reduction and Management Office
// Brgy. 9, P. Malbas St / Atega Ave, Cabadbaran City (near Cabadbaran City Hall)
const CITY_HALL = {
  name: 'CDRRMO — Cabadbaran City',
  label: 'City Disaster Risk Reduction & Management Office',
  address: "Brgy. 9, P. Malbas St, Cabadbaran City, Agusan del Norte 8605",
  barangay: 'Poblacion 9',
  lat: 9.12128,
  lng: 125.54595,
};

// Official City of Cabadbaran boundary (NAMRIA 2023 / PSGC 1600203000)
// Format: [lat, lng]
const CABADBARAN_POLYGON = [
  [9.21637, 125.75833],
  [9.16362, 125.76751],
  [9.08609, 125.74909],
  [9.08686, 125.61214],
  [9.06575, 125.57026],
  [9.06599, 125.53377],
  [9.07859, 125.53659],
  [9.13958, 125.52022],
  [9.14545, 125.56956],
  [9.19037, 125.56980],
  [9.19190, 125.62604],
  [9.22239, 125.62695],
];

const CABADBARAN = {
  name: 'Cabadbaran City',
  center: { lat: CITY_HALL.lat, lng: CITY_HALL.lng },
  bounds: {
    south: 9.06575,
    north: 9.22239,
    west: 125.52022,
    east: 125.76751,
  },
};

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

// Dispatch stations — CDRRMO HQ is always the primary dispatch origin
const RESPONDER_STATIONS = [
  { id: 'hq', name: 'CDRRMO — Brgy. 9, Cabadbaran City', lat: CITY_HALL.lat, lng: CITY_HALL.lng },
];

function isWithinCabadbaran(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  return pointInPolygon(nLat, nLng, CABADBARAN_POLYGON);
}

function nearestStation(victimLat, victimLng) {
  let best = RESPONDER_STATIONS[0];
  let bestDist = Infinity;
  for (const station of RESPONDER_STATIONS) {
    const d = Math.hypot(victimLat - station.lat, victimLng - station.lng);
    if (d < bestDist) {
      bestDist = d;
      best = station;
    }
  }
  return best;
}

module.exports = {
  CITY_HALL,
  CABADBARAN,
  CABADBARAN_POLYGON,
  RESPONDER_STATIONS,
  isWithinCabadbaran,
  nearestStation,
};
