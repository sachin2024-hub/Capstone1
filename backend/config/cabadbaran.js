// Cabadbaran City, Agusan del Norte — service area boundary
const CABADBARAN = {
  name: 'Cabadbaran City',
  center: { lat: 9.1226, lng: 125.5344 },
  bounds: {
    south: 9.06,
    north: 9.19,
    west: 125.47,
    east: 125.585,
  },
};

// Real dispatch stations in Cabadbaran City (for road routing start points)
const RESPONDER_STATIONS = [
  { id: 'hq', name: 'RapidRescue HQ', lat: 9.1226, lng: 125.5344 },
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

module.exports = { CABADBARAN, RESPONDER_STATIONS, isWithinCabadbaran, nearestStation };
