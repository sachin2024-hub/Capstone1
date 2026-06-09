// CDRRMO — City Disaster Risk Reduction and Management Office
// Brgy. 9, P. Malbas St / Atega Ave, Cabadbaran City (near Cabadbaran City Hall)
export const CITY_HALL = {
  name: 'CDRRMO — Cabadbaran City',
  label: 'City Disaster Risk Reduction & Management Office',
  address: "Brgy. 9, P. Malbas St, Cabadbaran City, Agusan del Norte 8605",
  barangay: 'Poblacion 9',
  hours: 'Open 24 hours',
  lat: 9.12128,
  lng: 125.54595,
};

export const CABADBARAN = {
  name: 'Cabadbaran City',
  center: [CITY_HALL.lat, CITY_HALL.lng],
  bounds: {
    south: 9.06,
    north: 9.19,
    west: 125.47,
    east: 125.585,
  },
  defaultZoom: 16,
  minZoom: 11,
  maxZoom: 19,
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
  { id: 'hq', name: 'CDRRMO — Brgy. 9, Cabadbaran City', lat: CITY_HALL.lat, lng: CITY_HALL.lng },
  { id: 'north', name: 'Station North (Tubay)', lat: 9.168, lng: 125.528 },
  { id: 'east', name: 'Station East (Comagascas)', lat: 9.108, lng: 125.565 },
  { id: 'south', name: 'Station South (Santiago)', lat: 9.075, lng: 125.538 },
];
