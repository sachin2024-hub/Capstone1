// Official 31 barangays of Cabadbaran City + approximate centroids (lat/lng)
const BARANGAY_CENTROIDS = [
  { name: 'Antonio Luna', lat: 9.0826674, lng: 125.5918351 },
  { name: 'Bay-ang', lat: 9.103315, lng: 125.5779254 },
  { name: 'Bayabas', lat: 9.1450509, lng: 125.5939576 },
  { name: 'Caasinan', lat: 9.1364744, lng: 125.5232594 },
  { name: 'Cabinet', lat: 9.1269276, lng: 125.5268025 },
  { name: 'Calamba', lat: 9.0974249, lng: 125.6061744 },
  { name: 'Calibunan', lat: 9.106223, lng: 125.5306542 },
  { name: 'Comagascas', lat: 9.1357197, lng: 125.5599117 },
  { name: 'Concepcion', lat: 9.1844959, lng: 125.5791538 },
  { name: 'Del Pilar', lat: 9.1526603, lng: 125.5827485 },
  { name: 'Katugasan', lat: 9.1320116, lng: 125.5825348 },
  { name: 'Kauswagan', lat: 9.1303597, lng: 125.5334329 },
  { name: 'La Union', lat: 9.08449, lng: 125.5364483 },
  { name: 'Mabini', lat: 9.1141098, lng: 125.5517363 },
  { name: 'Mahaba', lat: 9.1066505, lng: 125.6189718 },
  { name: 'Poblacion 1', lat: 9.1205473, lng: 125.535573 },
  { name: 'Poblacion 2', lat: 9.1212, lng: 125.5362 },
  { name: 'Poblacion 3', lat: 9.122, lng: 125.5368 },
  { name: 'Poblacion 4', lat: 9.1258294, lng: 125.5352312 },
  { name: 'Poblacion 5', lat: 9.1245, lng: 125.5348 },
  { name: 'Poblacion 6', lat: 9.1238, lng: 125.5342 },
  { name: 'Poblacion 7', lat: 9.123, lng: 125.5336 },
  { name: 'Poblacion 8', lat: 9.1222, lng: 125.533 },
  { name: 'Poblacion 9', lat: 9.1215, lng: 125.5324 },
  { name: 'Poblacion 10', lat: 9.1208, lng: 125.5318 },
  { name: 'Poblacion 11', lat: 9.1201, lng: 125.5312 },
  { name: 'Poblacion 12', lat: 9.1194, lng: 125.5306 },
  { name: 'Puting Bato', lat: 9.1259515, lng: 125.6361839 },
  { name: 'Sanghan', lat: 9.0868415, lng: 125.5724215 },
  { name: 'Soriano', lat: 9.0983677, lng: 125.5644822 },
  { name: 'Tolosa', lat: 9.1199044, lng: 125.5260837 },
];

const OFFICIAL_BARANGAYS = BARANGAY_CENTROIDS.map((b) => b.name);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchOfficialBarangay(...sources) {
  for (const src of sources) {
    if (!src) continue;
    const text = normalizeText(src);

    const poblacionMatch = text.match(/poblacion\s*(\d{1,2})/i);
    if (poblacionMatch) {
      const num = Number(poblacionMatch[1]);
      if (num >= 1 && num <= 12) return `Poblacion ${num}`;
    }

    for (const name of OFFICIAL_BARANGAYS) {
      const normalizedName = normalizeText(name);
      const pattern = new RegExp(`\\b${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(text)) return name;
    }

    const brgyMatch = String(src).match(/barangay\s+([^,]+)/i);
    if (brgyMatch) {
      const inner = matchOfficialBarangay(brgyMatch[1]);
      if (inner) return inner;
    }
  }
  return '';
}

function nearestBarangay(lat, lng) {
  let best = BARANGAY_CENTROIDS[0];
  let bestDist = Infinity;

  for (const barangay of BARANGAY_CENTROIDS) {
    const d = Math.hypot(lat - barangay.lat, lng - barangay.lng);
    if (d < bestDist) {
      bestDist = d;
      best = barangay;
    }
  }

  return best.name;
}

function extractPurok(...sources) {
  for (const src of sources) {
    if (!src) continue;
    const text = String(src);
    const patterns = [
      /purok\s*(\d+[a-z]?)/i,
      /prk\.?\s*(\d+[a-z]?)/i,
      /\bp[\s.-]*(\d+[a-z]?)\b/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return `Purok ${match[1]}`;
    }
  }
  return '';
}

// Fallback when OSM has no purok — use road or landmark name
function extractAreaLabel(nAddr = {}, barangay = '') {
  const road = nAddr.road || nAddr.residential || nAddr.pedestrian;
  if (road) return road;

  const place = nAddr.hamlet || nAddr.neighbourhood || nAddr.quarter;
  if (place) {
    const norm = normalizeText(place);
    const brgyNorm = normalizeText(barangay);
    if (!brgyNorm || !norm.includes(brgyNorm)) return place;
  }

  if (barangay) return `Near Barangay ${barangay}`;
  return '';
}

module.exports = {
  BARANGAY_CENTROIDS,
  OFFICIAL_BARANGAYS,
  matchOfficialBarangay,
  nearestBarangay,
  extractPurok,
  extractAreaLabel,
  normalizeText,
};
