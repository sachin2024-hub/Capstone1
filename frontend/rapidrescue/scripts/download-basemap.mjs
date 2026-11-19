// One-time script: downloads the data used to DRAW the offline street map of Cabadbaran
// (roads, rivers, lakes, place names) from OpenStreetMap via Overpass, and saves it as a
// compact file at public/offline/basemap.json. The browser draws this map itself, so no
// tile server (and no internet) is needed at runtime.
//
// Run:  node scripts/download-basemap.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'offline', 'basemap.json');

const PAD = 0.01;
const B = { s: 9.06575 - PAD, w: 125.52022 - PAD, n: 9.22239 + PAD, e: 125.76751 + PAD };
const bbox = `(${B.s},${B.w},${B.n},${B.e})`;

const MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const query = `[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|path|footway|pedestrian|steps)$"]${bbox};
  way["waterway"~"^(river|stream|canal)$"]${bbox};
  way["natural"="water"]${bbox};
  way["natural"="wetland"]${bbox};
  node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|island)$"]${bbox};
);
out geom;`;

// road class codes (also used by the renderer)
const CLASS = {
  motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3,
  unclassified: 4, residential: 4, living_street: 4, road: 4,
  service: 5, track: 6, path: 7, footway: 7, pedestrian: 7, steps: 7,
};
const PLACE_RANK = { city: 0, town: 1, suburb: 2, village: 2, hamlet: 3, neighbourhood: 3, island: 2 };

async function fetchOverpass() {
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of MIRRORS) {
      try {
        console.log(`Querying ${url} (attempt ${attempt + 1})…`);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'User-Agent': 'RapidRescue-student-project/1.0',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(200_000),
        });
        if (res.ok) return await res.json();
        console.log(`  → HTTP ${res.status}`);
      } catch (e) {
        console.log(`  → ${e.cause?.code || e.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error('All Overpass mirrors failed. Try again later.');
}

const data = await fetchOverpass();
const q = (v) => Math.round(v * 1e5); // 1e-5 deg ≈ 1.1 m

const roads = []; // [class, name, [lat,lng,lat,lng…]]
const waterLines = []; // [[lat,lng,…]]
const waterAreas = []; // [[lat,lng,…]]
const places = []; // [rank, name, lat, lng]

for (const el of data.elements) {
  if (el.type === 'node' && el.tags?.place && el.tags.name) {
    places.push([PLACE_RANK[el.tags.place] ?? 3, el.tags.name, q(el.lat), q(el.lon)]);
    continue;
  }
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
  const flat = [];
  for (const p of el.geometry) flat.push(q(p.lat), q(p.lon));
  const t = el.tags || {};

  if (t.highway) {
    roads.push([CLASS[t.highway.replace(/_link$/, '')] ?? 4, t.name || '', flat]);
  } else if (t.waterway) {
    waterLines.push(flat);
  } else if (t.natural === 'water' || t.natural === 'wetland') {
    waterAreas.push(flat);
  }
}

// draw big roads last (on top): sort by class descending
roads.sort((a, b) => b[0] - a[0]);

const out = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap contributors (ODbL)',
  scale: 1e5,
  roads,
  waterLines,
  waterAreas,
  places,
};

await mkdir(path.dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
await writeFile(OUT, json);
console.log(
  `Done: ${roads.length} roads, ${waterLines.length} waterways, ${waterAreas.length} water areas, ` +
    `${places.length} places → ${OUT} (${Math.round(json.length / 1024)} KB)`
);
