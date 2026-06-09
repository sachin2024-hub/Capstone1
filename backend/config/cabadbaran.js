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

// Cabadbaran City, Agusan del Norte — service area boundary
const CABADBARAN = {
  name: 'Cabadbaran City',
  center: { lat: CITY_HALL.lat, lng: CITY_HALL.lng },
  bounds: {
    south: 9.06,
    north: 9.19,
    west: 125.47,
    east: 125.585,
  },
};

// Dispatch stations — CDRRMO HQ is always the primary dispatch origin
const RESPONDER_STATIONS = [
  { id: 'hq', name: 'CDRRMO — Brgy. 9, Cabadbaran City', lat: CITY_HALL.lat, lng: CITY_HALL.lng },
  { id: 'north', name: 'Station North (Tubay)', lat: 9.168, lng: 125.528 },
  { id: 'east', name: 'Station East (Comagascas)', lat: 9.108, lng: 125.565 },
  { id: 'south', name: 'Station South (Santiago)', lat: 9.075, lng: 125.538 },
];

function isWithinCabadbaran(lat, lng) {
  const { south, north, west, east } = CABADBARAN.bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
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

module.exports = { CITY_HALL, CABADBARAN, RESPONDER_STATIONS, isWithinCabadbaran, nearestStation };
