const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const OSM = 'https://{s}.tile.openstreetmap.org';

// Esri satellite has no tiles past ~17 in rural PH — maxNativeZoom avoids "Map data not yet available"
const ESRI_SAT_MAX_NATIVE = 17;

export const MAP_LAYERS = [
  {
    id: 'hybrid',
    label: 'Satellite',
    preview: 'hybrid',
    mapMaxZoom: 19,
    layers: [
      {
        url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
        attribution: '&copy; Esri, Maxar, Earthstar Geographics',
        maxNativeZoom: ESRI_SAT_MAX_NATIVE,
        maxZoom: 19,
      },
      {
        url: `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`,
        maxNativeZoom: ESRI_SAT_MAX_NATIVE,
        maxZoom: 19,
        opacity: 0.9,
      },
      {
        url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
        maxNativeZoom: ESRI_SAT_MAX_NATIVE,
        maxZoom: 19,
        opacity: 1,
      },
    ],
  },
  {
    id: 'streets',
    label: 'Map',
    preview: 'streets',
    mapMaxZoom: 19,
    layers: [
      {
        url: `${OSM}/{z}/{x}/{y}.png`,
        subdomains: 'abc',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      },
    ],
  },
  {
    id: 'terrain',
    label: 'Terrain',
    preview: 'terrain',
    mapMaxZoom: 17,
    layers: [
      {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        attribution: '&copy; OpenTopoMap (&copy; OpenStreetMap contributors)',
        maxZoom: 17,
      },
    ],
  },
  {
    id: 'dark',
    label: 'Dark',
    preview: 'dark',
    mapMaxZoom: 16,
    layers: [
      {
        url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
        attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap contributors',
        maxNativeZoom: 16,
        maxZoom: 16,
      },
      {
        url: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
        maxNativeZoom: 16,
        maxZoom: 16,
      },
    ],
  },
];
