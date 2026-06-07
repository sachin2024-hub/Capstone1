import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const BASE = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img';

// 🔴 Victim/SOS location
export const victimIcon = new L.Icon({
  iconUrl: `${BASE}/marker-icon-red.png`,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// 🔵 Responder (dispatched from station)
export const responderIcon = new L.Icon({
  iconUrl: `${BASE}/marker-icon-blue.png`,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// 🟠 Outside city alert
export const outsideIcon = new L.Icon({
  iconUrl: `${BASE}/marker-icon-orange.png`,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// 🟢 DRRMO HQ — permanent admin/headquarters marker
export const drrmoIcon = new L.Icon({
  iconUrl: `${BASE}/marker-icon-green.png`,
  shadowUrl: markerShadow,
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
  shadowSize: [41, 41],
});

// 🟣 Other dispatch stations (always visible on map)
export const stationIcon = new L.Icon({
  iconUrl: `${BASE}/marker-icon-violet.png`,
  shadowUrl: markerShadow,
  iconSize: [20, 33],
  iconAnchor: [10, 33],
  popupAnchor: [1, -28],
  shadowSize: [41, 41],
});
