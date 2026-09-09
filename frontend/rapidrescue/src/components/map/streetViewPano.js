const RADII = [80, 200, 500, 1200, 2500, 5000];

function searchUrl(lat, lng, radius, callback) {
  const pb =
    `!1m5!1sapiv3!5sPH!11m2!1m1!1b0!2m4!1m2!3d${lat}!4d${lng}!2d${radius}` +
    '!3m18!2m2!1sen!2sPH!9m1!1e2!11m12!1m3!1e2!2b1!3e2!1m3!1e3!2b1!3e2!1m3!1e10!2b1!3e2!4m6!1e1!1e2!1e3!1e4!1e8!1e6';
  return `https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb=${pb}&callback=${callback}`;
}

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

function jsonpSearch(lat, lng, radius) {
  return new Promise((resolve) => {
    const name = `__rrPano${Math.random().toString(36).slice(2)}`;
    let settled = false;
    const script = document.createElement('script');

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window[name];
      script.remove();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), 4000);
    window[name] = (payload) => finish(extractResult(payload));
    script.onerror = () => finish(null);
    script.src = searchUrl(lat, lng, radius, name);
    document.head.appendChild(script);
  });
}

export async function findNearestPano(lat, lng) {
  const origin = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null;

  for (const radius of RADII) {
    const found = await jsonpSearch(origin.lat, origin.lng, radius);
    if (found?.pano) return found;
  }
  return null;
}
