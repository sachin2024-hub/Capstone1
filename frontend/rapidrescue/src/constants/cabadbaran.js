export const CABADBARAN = {
  name: 'Cabadbaran City',
  center: [9.1226, 125.5344],
  bounds: {
    south: 9.06,
    north: 9.19,
    west: 125.47,
    east: 125.585,
  },
  defaultZoom: 13,
  minZoom: 12,
  maxZoom: 17,
};

// Leaflet format: [[south, west], [north, east]]
export const CABADBARAN_MAX_BOUNDS = [
  [CABADBARAN.bounds.south, CABADBARAN.bounds.west],
  [CABADBARAN.bounds.north, CABADBARAN.bounds.east],
];

// Boundary rectangle corners (clockwise)
export const CABADBARAN_POLYGON = [
  [CABADBARAN.bounds.south, CABADBARAN.bounds.west],
  [CABADBARAN.bounds.south, CABADBARAN.bounds.east],
  [CABADBARAN.bounds.north, CABADBARAN.bounds.east],
  [CABADBARAN.bounds.north, CABADBARAN.bounds.west],
];

export const RESPONDER_STATIONS = [
  { id: 'hq', name: 'RapidRescue HQ', lat: 9.1226, lng: 125.5344 },
  { id: 'north', name: 'Station North (Tubay)', lat: 9.168, lng: 125.528 },
  { id: 'east', name: 'Station East (Comagascas)', lat: 9.108, lng: 125.565 },
  { id: 'south', name: 'Station South (Santiago)', lat: 9.075, lng: 125.538 },
];
