const RADII = [80, 200, 500, 1200, 2500, 5000];
const SEARCH_URL =
  'https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch';

function walk(node, visit) {
  if (!Array.isArray(node)) return;
  visit(node);
  for (const child of node) walk(child, visit);
}

function extractResult(data) {
  if (!data) return null;
  let carPano = '';
  let anyPano = '';
  let lat = null;
  let lng = null;

  walk(data, (node) => {
    if (
      node.length >= 2 &&
      node.length <= 4 &&
      (node[0] === 2 || node[0] === 10) &&
      typeof node[1] === 'string' &&
      node[1].length >= 16 &&
      !node[1].includes(' ')
    ) {
      if (node[0] === 2 && !carPano) carPano = node[1];
      if (!anyPano) anyPano = node[1];
    }
    if (
      lat == null &&
      node.length >= 4 &&
      node[0] === null &&
      node[1] === null &&
      typeof node[2] === 'number' &&
      typeof node[3] === 'number' &&
      node[2] >= -90 &&
      node[2] <= 90 &&
      node[3] >= -180 &&
      node[3] <= 180
    ) {
      lat = node[2];
      lng = node[3];
    }
  });

  const pano = carPano || anyPano;
  if (!pano || lat == null || lng == null) return null;
  return { pano, lat, lng };
}

export function panoDistanceMeters(from, to) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function rpcSearch(lat, lng, radius) {
  const body = [
    ['apiv3', null, null, null, 'PH', null, null, null, null, null, [[false]]],
    [[null, null, lat, lng], radius],
    [null, null, null, null, null, null, null, null, [2], null, [[[2, true, 2], [3, true, 2], [10, true, 2]]]],
    [[1, 2, 3, 4, 8, 6]],
  ];

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json+protobuf' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return extractResult(await res.json());
}

export async function findNearestPano(lat, lng) {
  const origin = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null;

  for (const radius of RADII) {
    try {
      const found = await rpcSearch(origin.lat, origin.lng, radius);
      if (!found?.pano) continue;
      if (panoDistanceMeters(origin, found) <= radius) return found;
    } catch {
      return null;
    }
  }
  return null;
}

export function pickCloserPano(origin, ...candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!candidate?.pano) continue;
    const distance = panoDistanceMeters(origin, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
