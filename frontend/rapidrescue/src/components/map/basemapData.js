// Loads the offline basemap data (public/offline/basemap.json) once and prepares it for drawing.
const DATA_URL = `${import.meta.env.BASE_URL}offline/basemap.json`;

let dataPromise = null;

function prepare(raw) {
  const k = 1 / (raw.scale || 1e5);
  const toBox = (flat) => {
    let s = Infinity;
    let n = -Infinity;
    let w = Infinity;
    let e = -Infinity;
    for (let i = 0; i < flat.length; i += 2) {
      const la = flat[i] * k;
      const ln = flat[i + 1] * k;
      if (la < s) s = la;
      if (la > n) n = la;
      if (ln < w) w = ln;
      if (ln > e) e = ln;
    }
    return { s, n, w, e };
  };
  const feat = (flat, extra = {}) => ({ pts: flat.map((v) => v * k), box: toBox(flat), ...extra });

  const byClass = Array.from({ length: 8 }, () => []);
  for (const [cls, name, flat] of raw.roads) byClass[cls].push(feat(flat, { name, cls }));

  return {
    byClass,
    waterLines: raw.waterLines.map((f) => feat(f)),
    waterAreas: raw.waterAreas.map((f) => feat(f)),
    places: raw.places.map(([rank, name, la, ln]) => ({ rank, name, lat: la * k, lng: ln * k })),
  };
}

export function loadBasemap() {
  if (!dataPromise) {
    dataPromise = fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`basemap.json HTTP ${r.status}`);
        return r.json();
      })
      .then(prepare)
      .catch((err) => {
        dataPromise = null;
        throw err;
      });
  }
  return dataPromise;
}

