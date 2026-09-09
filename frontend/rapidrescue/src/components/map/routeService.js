// OSRM road routing — follows actual streets in Cabadbaran
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const cache = new Map();
const inflight = new Map();

function routeCacheKey(from, to) {
  return `${Number(from.lat).toFixed(5)},${Number(from.lng).toFixed(5)}>${Number(to.lat).toFixed(5)},${Number(to.lng).toFixed(5)}`;
}

function haversineMeters(from, to) {
  const R = 6371000;
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const h =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function straightRoute(from, to) {
  const distance = haversineMeters(from, to);
  return {
    points: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    distance,
    duration: distance / 8.3,
    isRoad: false,
  };
}

export async function fetchRoute(from, to) {
  const key = routeCacheKey(from, to);
  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=simplified&geometries=geojson&steps=false&alternatives=false`;

  const pending = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes?.[0]) {
        const fallback = straightRoute(from, to);
        cache.set(key, fallback);
        return fallback;
      }
      const route = data.routes[0];
      const result = {
        points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distance: route.distance,
        duration: route.duration,
        isRoad: true,
      };
      cache.set(key, result);
      return result;
    } catch {
      const fallback = straightRoute(from, to);
      cache.set(key, fallback);
      return fallback;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, pending);
  return pending;
}

export function formatDistance(meters) {
  if (!meters) return '0 m';
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
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
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
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
