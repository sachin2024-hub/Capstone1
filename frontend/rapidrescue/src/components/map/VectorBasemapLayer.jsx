import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { loadBasemap } from './basemapData';

// Offline street map: the browser DRAWS the map itself from public/offline/basemap.json
// (roads, rivers, lakes, place names from OpenStreetMap — see scripts/download-basemap.mjs).
// No tile server and no internet connection are needed.

const TILE = 256;

// ── styling ────────────────────────────────────────────────────────────
const BG = '#f2efe9';
const WATER = '#aad3df';
// [fill, casing, widthAtZ13]
const ROAD_STYLE = [
  ['#f9b95c', '#d0902f', 3.2], // 0 motorway / trunk
  ['#fcd28a', '#d0a84f', 3.0], // 1 primary
  ['#fdeaa6', '#cdb866', 2.4], // 2 secondary
  ['#ffffff', '#b8b8b8', 2.0], // 3 tertiary
  ['#ffffff', '#c4c4c4', 1.5], // 4 residential / unclassified
  ['#ffffff', '#cfcfcf', 0.9], // 5 service
  ['#c9a46a', null, 0.8], // 6 track (dashed)
  ['#d98c8c', null, 0.7], // 7 footpath (dashed)
];

function minClassForZoom(z) {
  if (z < 11) return 1;
  if (z < 13) return 3;
  if (z < 15) return 4;
  if (z < 16) return 5;
  if (z < 17) return 6;
  return 7;
}

function worldXY(lat, lng, z) {
  const S = TILE * 2 ** z;
  const x = ((lng + 180) / 360) * S;
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * S;
  return [x, y];
}

function strokePath(ctx, pts, ox, oy, z) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const [x, y] = worldXY(pts[i], pts[i + 1], z);
    if (i === 0) ctx.moveTo(x - ox, y - oy);
    else ctx.lineTo(x - ox, y - oy);
  }
}

function haloText(ctx, text, x, y, size, color = '#333') {
  ctx.font = `${size}px "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawTile(data, canvas, coords, dpr) {
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, TILE, TILE);
  if (!data) return;

  const z = coords.z;
  const ox = coords.x * TILE;
  const oy = coords.y * TILE;

  // tile bounds in degrees (+ margin so wide strokes / labels are not cut at the edges)
  const margin = 40;
  const nw = L.CRS.EPSG3857.pointToLatLng(L.point(ox - margin, oy - margin), z);
  const se = L.CRS.EPSG3857.pointToLatLng(L.point(ox + TILE + margin, oy + TILE + margin), z);
  const hit = (b) => b.s <= nw.lat && b.n >= se.lat && b.w <= se.lng && b.e >= nw.lng;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // water
  ctx.fillStyle = WATER;
  for (const f of data.waterAreas) {
    if (!hit(f.box)) continue;
    strokePath(ctx, f.pts, ox, oy, z);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = WATER;
  ctx.lineWidth = Math.max(1, 0.9 * 1.3 ** (z - 12));
  for (const f of data.waterLines) {
    if (!hit(f.box)) continue;
    strokePath(ctx, f.pts, ox, oy, z);
    ctx.stroke();
  }

  // roads: minor first so major roads end up on top; casing then fill per class
  const minCls = minClassForZoom(z);
  const scale = 1.35 ** (z - 13);
  const labels = [];
  for (let cls = minCls; cls >= 0; cls--) {
    const [fill, casing, base] = ROAD_STYLE[cls];
    const width = Math.max(0.8, base * scale);
    const visible = data.byClass[cls].filter((f) => hit(f.box));
    if (!visible.length) continue;

    if (cls >= 6) {
      ctx.setLineDash([Math.max(3, width * 3), Math.max(2, width * 2)]);
      ctx.strokeStyle = fill;
      ctx.lineWidth = Math.max(1, width);
      for (const f of visible) {
        strokePath(ctx, f.pts, ox, oy, z);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      continue;
    }

    if (casing && width > 1.6) {
      ctx.strokeStyle = casing;
      ctx.lineWidth = width + 2;
      for (const f of visible) {
        strokePath(ctx, f.pts, ox, oy, z);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    for (const f of visible) {
      strokePath(ctx, f.pts, ox, oy, z);
      ctx.stroke();
    }
    if (z >= 15) for (const f of visible) if (f.name && cls <= 4) labels.push(f);
  }

  // road names (rotated along the longest segment)
  if (z >= 15) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of labels) {
      const size = z >= 17 ? 12 : 10;
      ctx.font = `${size}px "Segoe UI", Roboto, Arial, sans-serif`;
      const textW = ctx.measureText(f.name).width;
      let best = null;
      let bestLen = 0;
      for (let i = 0; i + 3 < f.pts.length; i += 2) {
        const [x1, y1] = worldXY(f.pts[i], f.pts[i + 1], z);
        const [x2, y2] = worldXY(f.pts[i + 2], f.pts[i + 3], z);
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len > bestLen) {
          bestLen = len;
          best = [x1, y1, x2, y2];
        }
      }
      if (!best || bestLen < textW + 6) continue;
      const cx = (best[0] + best[2]) / 2 - ox;
      const cy = (best[1] + best[3]) / 2 - oy;
      if (cx < -textW || cx > TILE + textW || cy < -textW || cy > TILE + textW) continue;
      let ang = Math.atan2(best[3] - best[1], best[2] - best[0]);
      if (ang > Math.PI / 2) ang -= Math.PI;
      else if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      haloText(ctx, f.name, 0, 0, size, '#444');
      ctx.restore();
    }
  }

  // place names
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of data.places) {
    const minZ = p.rank <= 1 ? 9 : p.rank === 2 ? 12 : 14;
    if (z < minZ) continue;
    const [x, y] = worldXY(p.lat, p.lng, z);
    const size = p.rank <= 1 ? 15 : p.rank === 2 ? 13 : 11;
    const half = (p.name.length * size * 0.6) / 2;
    const px = x - ox;
    const py = y - oy;
    if (px < -half - 10 || px > TILE + half + 10 || py < -20 || py > TILE + 20) continue;
    haloText(ctx, p.name, px, py, size, p.rank <= 1 ? '#222' : '#555');
  }
}

/** Offline street map drawn in the browser — drop-in replacement for a TileLayer. */
export default function VectorBasemapLayer({ attribution, maxZoom = 19 }) {
  const map = useMap();

  useEffect(() => {
    let data = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const Layer = L.GridLayer.extend({
      createTile(coords) {
        const tile = document.createElement('canvas');
        tile.width = TILE * dpr;
        tile.height = TILE * dpr;
        tile.style.width = `${TILE}px`;
        tile.style.height = `${TILE}px`;
        drawTile(data, tile, coords, dpr);
        return tile;
      },
    });
    const layer = new Layer({ attribution, maxZoom, tileSize: TILE });
    layer.addTo(map);

    let alive = true;
    loadBasemap()
      .then((d) => {
        if (!alive) return;
        data = d;
        layer.redraw();
      })
      .catch(() => {});

    return () => {
      alive = false;
      layer.remove();
    };
  }, [map, attribution, maxZoom]);

  return null;
}
