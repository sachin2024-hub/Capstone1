// Offline road routing for Cabadbaran.
//
// Loads the road network saved by scripts/download-roads.mjs (public/offline/roads.json),
// builds a graph in memory and finds the fastest path with A* — no internet needed.

const ROADS_URL = `${import.meta.env.BASE_URL}offline/roads.json`;
const MAX_SPEED_MPS = 60 / 3.6; // fastest road speed in the data → keeps the A* heuristic admissible
const MAX_SNAP_METERS = 1500; // endpoints farther than this from any road → not covered

let graphPromise = null;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function buildGraph(raw) {
  const scale = raw.scale || 1e6;
  const n = raw.coords.length / 2;
  const lat = new Float64Array(n);
  const lng = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lat[i] = raw.coords[2 * i] / scale;
    lng[i] = raw.coords[2 * i + 1] / scale;
  }

  // adjacency: for each node, flat list of [neighbour, seconds]
  const adj = Array.from({ length: n }, () => []);
  const undirected = Array.from({ length: n }, () => []);
  for (const way of raw.ways) {
    const oneway = way[0];
    const mps = Math.max(way[1], 5) / 3.6;
    for (let k = 2; k < way.length - 1; k++) {
      const a = way[k];
      const b = way[k + 1];
      if (a === b) continue;
      const secs = haversine(lat[a], lng[a], lat[b], lng[b]) / mps;
      if (oneway >= 0) adj[a].push(b, secs);
      if (oneway <= 0) adj[b].push(a, secs);
      undirected[a].push(b);
      undirected[b].push(a);
    }
  }

  // Keep only the largest connected component for snapping (avoids snapping onto isolated roads)
  const comp = new Int32Array(n).fill(-1);
  let bestComp = -1;
  let bestSize = 0;
  let compId = 0;
  const stack = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1 || undirected[s].length === 0) continue;
    let size = 0;
    stack.push(s);
    comp[s] = compId;
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (const v of undirected[u]) {
        if (comp[v] === -1) {
          comp[v] = compId;
          stack.push(v);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestComp = compId;
    }
    compId++;
  }

  // Spatial grid index of the usable nodes (cells ≈ 0.005° ≈ 550 m)
  const CELL = 0.005;
  const grid = new Map();
  const cellKey = (la, ln) => `${Math.floor(la / CELL)}:${Math.floor(ln / CELL)}`;
  for (let i = 0; i < n; i++) {
    if (comp[i] !== bestComp) continue;
    const key = cellKey(lat[i], lng[i]);
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }

  return { n, lat, lng, adj, grid, CELL };
}

function loadGraph() {
  if (!graphPromise) {
    graphPromise = fetch(ROADS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`roads.json HTTP ${res.status}`);
        return res.json();
      })
      .then(buildGraph)
      .catch((err) => {
        graphPromise = null; // allow retry later
        throw err;
      });
  }
  return graphPromise;
}

/** Resolves true once the offline road network is loaded, false if it could not be loaded. */
export function offlineRoadsReady() {
  return loadGraph().then(() => true, () => false);
}

/** Start loading the road network early (e.g. when the map mounts). */
export function preloadOfflineRoads() {
  loadGraph().catch(() => {});
}

function snapToRoad(g, la, ln) {
  const ci = Math.floor(la / g.CELL);
  const cj = Math.floor(ln / g.CELL);
  let best = -1;
  let bestD = Infinity;

  const scanRing = (ring) => {
    for (let di = -ring; di <= ring; di++) {
      for (let dj = -ring; dj <= ring; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const bucket = g.grid.get(`${ci + di}:${cj + dj}`);
        if (!bucket) continue;
        for (const idx of bucket) {
          const d = haversine(la, ln, g.lat[idx], g.lng[idx]);
          if (d < bestD) {
            bestD = d;
            best = idx;
          }
        }
      }
    }
  };

  // widen the search ring (max ~3 km); after the first hit scan one extra ring,
  // because a node in the next ring can still be closer than the first hit
  let foundAt = -1;
  for (let ring = 0; ring <= 6; ring++) {
    scanRing(ring);
    if (best !== -1 && foundAt === -1) foundAt = ring;
    if (foundAt !== -1 && ring > foundAt) break;
  }
  return best === -1 ? null : { node: best, distance: bestD };
}

// Minimal binary min-heap keyed by priority
class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }
  get size() {
    return this.keys.length;
  }
  push(key, val) {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop() {
    const { keys, vals } = this;
    const topVal = vals[0];
    const lastKey = keys.pop();
    const lastVal = vals.pop();
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastKey) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return topVal;
  }
}

function astar(g, start, goal) {
  const dist = new Float64Array(g.n).fill(Infinity);
  const prev = new Int32Array(g.n).fill(-1);
  const closed = new Uint8Array(g.n);
  const h = (i) => haversine(g.lat[i], g.lng[i], g.lat[goal], g.lng[goal]) / MAX_SPEED_MPS;

  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(h(start), start);

  while (heap.size) {
    const u = heap.pop();
    if (closed[u]) continue;
    if (u === goal) break;
    closed[u] = 1;
    const edges = g.adj[u];
    for (let k = 0; k < edges.length; k += 2) {
      const v = edges[k];
      if (closed[v]) continue;
      const nd = dist[u] + edges[k + 1];
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        heap.push(nd + h(v), v);
      }
    }
  }

  if (!Number.isFinite(dist[goal])) return null;
  const path = [];
  for (let c = goal; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  return { path, seconds: dist[goal] };
}

/**
 * Fastest road route between two points using the offline road network.
 * Returns { points, distance, duration, isRoad: true, offline: true } or null
 * if the road data is unavailable / the points are outside its coverage / no path exists.
 */
export async function offlineRoute(from, to) {
  let g;
  try {
    g = await loadGraph();
  } catch {
    return null;
  }

  const a = snapToRoad(g, Number(from.lat), Number(from.lng));
  const b = snapToRoad(g, Number(to.lat), Number(to.lng));
  if (!a || !b || a.distance > MAX_SNAP_METERS || b.distance > MAX_SNAP_METERS) return null;

  const result = a.node === b.node ? { path: [a.node], seconds: 0 } : astar(g, a.node, b.node);
  if (!result) return null;

  const points = [[Number(from.lat), Number(from.lng)]];
  for (const i of result.path) points.push([g.lat[i], g.lng[i]]);
  points.push([Number(to.lat), Number(to.lng)]);

  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    distance += haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  // time on the road graph + walking-pace-ish connector from/to the nearest road
  const duration = result.seconds + (a.distance + b.distance) / 8.3;

  return { points, distance, duration, isRoad: true, offline: true };
}

/** Nearest point on the road network (offline). Returns { lat, lng, distance } or null. */
export async function offlineNearestRoadPoint(lat, lng) {
  let g;
  try {
    g = await loadGraph();
  } catch {
    return null;
  }
  const s = snapToRoad(g, Number(lat), Number(lng));
  if (!s || s.distance > MAX_SNAP_METERS) return null;
  return { lat: g.lat[s.node], lng: g.lng[s.node], distance: s.distance };
}
