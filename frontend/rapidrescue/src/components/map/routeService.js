// OSRM road routing — follows actual streets in Cabadbaran
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export async function fetchRoute(from, to) {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=false`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.[0]) {
      return { points: [[from.lat, from.lng], [to.lat, to.lng]], distance: 0, duration: 0, isRoad: false };
    }

    const route = data.routes[0];
    const points = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

    return {
      points,
      distance: route.distance,
      duration: route.duration,
      isRoad: true,
    };
  } catch {
    return { points: [[from.lat, from.lng], [to.lat, to.lng]], distance: 0, duration: 0, isRoad: false };
  }
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '< 1 min';
  return `${mins} min`;
}
