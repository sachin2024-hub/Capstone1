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

export async function nearestRoadPoint(lat, lng) {
  const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const wp = data?.waypoints?.[0];
    if (!wp?.location) return null;
    const [roadLng, roadLat] = wp.location;
    return {
      lat: Number(roadLat),
      lng: Number(roadLng),
      distance: Number(wp.distance) || 0,
    };
  } catch {
    return null;
  }
}

export function headingBetween(from, to) {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
