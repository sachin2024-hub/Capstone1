// One-time script: downloads the Cabadbaran road network from OpenStreetMap (Overpass)
// and saves a compact graph to public/offline/roads.json for the in-browser router.
//
// Run:  node scripts/download-roads.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'offline', 'roads.json');

// City bbox (from src/constants/cabadbaran.js) + small padding
const PAD = 0.01;
const BBOX = { s: 9.06575 - PAD, w: 125.52022 - PAD, n: 9.22239 + PAD, e: 125.76751 + PAD };

const MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const HIGHWAYS =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';

const query = `[out:json][timeout:180];
way["highway"~"^(${HIGHWAYS})$"]["access"!~"^(private|no)$"]["motor_vehicle"!~"^(no|private)$"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
(._;>;);
out skel qt;`;

// Typical driving speeds (km/h) — Philippine rural/urban roads
const SPEED = {
  motorway: 60, trunk: 50, primary: 45, secondary: 40, tertiary: 35,
  unclassified: 30, residential: 25, living_street: 15, service: 15, road: 25, track: 15,
};

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

const nodeCoords = new Map();
const ways = [];
for (const el of data.elements) {
  if (el.type === 'node') nodeCoords.set(el.id, [el.lat, el.lon]);
  else if (el.type === 'way') ways.push(el);
}

// Re-index nodes that are actually used, store as integers (1e-6 deg ≈ 0.1 m)
const indexOf = new Map();
const coords = []; // flat: lat, lng, lat, lng …
const outWays = [];
for (const w of ways) {
  if (!w.nodes || w.nodes.length < 2) continue;
  const idxs = [];
  for (const id of w.nodes) {
    const c = nodeCoords.get(id);
    if (!c) continue;
    let i = indexOf.get(id);
    if (i === undefined) {
      i = coords.length / 2;
      indexOf.set(id, i);
      coords.push(Math.round(c[0] * 1e6), Math.round(c[1] * 1e6));
    }
    idxs.push(i);
  }
  if (idxs.length < 2) continue;

  const tags = w.tags || {};
  const hw = String(tags.highway || 'residential').replace(/_link$/, '');
  let speed = SPEED[hw] ?? 25;
  const maxspeed = parseInt(tags.maxspeed, 10);
  if (Number.isFinite(maxspeed) && maxspeed > 0 && maxspeed <= 120) speed = Math.min(speed, maxspeed);

  // oneway: 0 = both, 1 = forward only, -1 = reverse only
  let oneway = 0;
  const ow = String(tags.oneway || '').toLowerCase();
  if (ow === 'yes' || ow === 'true' || ow === '1') oneway = 1;
  else if (ow === '-1' || ow === 'reverse') oneway = -1;
  else if (tags.junction === 'roundabout') oneway = 1;

  outWays.push([oneway, speed, ...idxs]);
}

const out = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap contributors (ODbL)',
  scale: 1e6,
  coords,
  ways: outWays,
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
const kb = Math.round(JSON.stringify(out).length / 1024);
console.log(`Done: ${coords.length / 2} nodes, ${outWays.length} roads → ${OUT} (${kb} KB)`);
