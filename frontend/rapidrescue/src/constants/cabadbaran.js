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

// Official City of Cabadbaran boundary (NAMRIA 2023 / PSGC 1600203000)
// Leaflet format: [lat, lng]
export const CABADBARAN_POLYGON = [
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

function boundsFromPolygon(polygon, pad = 0) {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const [lat, lng] of polygon) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return {
    south: south - pad,
    north: north + pad,
    west: west - pad,
    east: east + pad,
  };
}

export const CABADBARAN = {
  name: 'Cabadbaran City',
  center: [CITY_HALL.lat, CITY_HALL.lng],
  bounds: boundsFromPolygon(CABADBARAN_POLYGON),
  defaultZoom: 12,
  minZoom: 8,
  maxZoom: 19,
};

// Leaflet format: [[south, west], [north, east]] — city bbox plus a little padding
export const CABADBARAN_MAX_BOUNDS = (() => {
  const { south, north, west, east } = boundsFromPolygon(CABADBARAN_POLYGON, 0.04);
  return [
    [south, west],
    [north, east],
  ];
})();

export const RESPONDER_STATIONS = [
  { id: 'hq', name: 'CDRRMO — Brgy. 9, Cabadbaran City', lat: CITY_HALL.lat, lng: CITY_HALL.lng },
];
