import L from 'leaflet';

function materialPin(symbol, color, size = 36) {
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
    ">
      <span class="material-symbols-outlined" style="
        color:#fff;font-size:${Math.round(size * 0.55)}px;line-height:1;
        font-variation-settings:'FILL' 1,'wght' 600,'GRAD' 0,'opsz' 24;
      ">${symbol}</span>
    </div>
  `;
  return L.divIcon({
    className: 'rr-material-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/** Classic Google Maps–style teardrop pin (red) for Victim / Help */
function googleMapsVictimPin() {
  const w = 36;
  const h = 48;
  const html = `
    <div style="width:${w}px;height:${h}px;position:relative;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));">
      <svg width="${w}" height="${h}" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="#EA4335" stroke="#fff" stroke-width="1.5"
          d="M18 1.5C9.44 1.5 2.5 8.44 2.5 17c0 11.25 13.2 27.1 14.2 28.28a1.7 1.7 0 0 0 2.6 0C20.3 44.1 33.5 28.25 33.5 17 33.5 8.44 26.56 1.5 18 1.5z"/>
        <circle cx="18" cy="17" r="7.2" fill="#fff"/>
        <path fill="#EA4335"
          d="M18 11.2c-1.55 0-2.8 1.25-2.8 2.8 0 1.54 1.25 2.8 2.8 2.8s2.8-1.26 2.8-2.8c0-1.55-1.25-2.8-2.8-2.8zm0 6.6c-2.2 0-6.6 1.1-6.6 3.3v1.1h13.2v-1.1c0-2.2-4.4-3.3-6.6-3.3z"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    className: 'rr-material-marker',
    html,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 4],
  });
}

// Victim / Help — Google Maps red person pin
export const victimIcon = googleMapsVictimPin();

// Responder (dispatched)
export const responderIcon = materialPin('local_shipping', '#1565c0', 38);

// Outside city alert
export const outsideIcon = materialPin('wrong_location', '#ef6c00', 40);

// City Hall / CDRRMO HQ
export const cityHallIcon = materialPin('apartment', '#f9a825', 44);

// DRRMO HQ
export const drrmoIcon = materialPin('apartment', '#2e7d32', 42);

// Station
export const stationIcon = materialPin('location_on', '#6a1b9a', 34);
