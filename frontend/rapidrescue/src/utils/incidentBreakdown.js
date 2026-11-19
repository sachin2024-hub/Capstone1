/**
 * Specific incident types per category, for the Analytics page. Plain JS (no React) so it can be
 * unit tested.
 *
 * Incident types are stored as "Category — Specific type", for example
 * "Vehicular Accident — Motorcycle vs Tricycle". The category-level charts only show the first
 * part; this answers "inside Vehicular Accident, which kind happens most?".
 */

export const UNSPECIFIED_LABEL = 'Not specified';
const SEPARATOR = ' — ';

/** "Vehicular Accident — Car vs Car" -> "Car vs Car"; a type with no detail -> UNSPECIFIED_LABEL. */
export function specificOf(type) {
  const text = String(type || '').trim();
  const at = text.indexOf(SEPARATOR);
  if (at === -1) return UNSPECIFIED_LABEL;
  const detail = text.slice(at + SEPARATOR.length).trim();
  return detail || UNSPECIFIED_LABEL;
}

function tally(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

const byCountThenName = (a, b) => b.count - a.count || a.label.localeCompare(b.label);

/**
 * rows: incidents. categoryOf(type): the same category function the rest of the page uses.
 * Returns categories (largest first), each with its specific types (most common first), plus an
 * `all` entry that ranks "Category — Specific" across everything.
 */
export function buildSpecificBreakdown(rows, categoryOf) {
  const categories = new Map(); // category -> { count, specifics: Map }
  const overall = new Map();

  for (const inc of rows || []) {
    const category = categoryOf(inc.incident_type) || 'Unknown';
    const specific = specificOf(inc.incident_type);
    let entry = categories.get(category);
    if (!entry) {
      entry = { category, count: 0, specifics: new Map() };
      categories.set(category, entry);
    }
    entry.count += 1;
    tally(entry.specifics, specific);
    tally(overall, specific === UNSPECIFIED_LABEL ? `${category} (${UNSPECIFIED_LABEL.toLowerCase()})` : `${category} — ${specific}`);
  }

  const list = [...categories.values()]
    .map((entry) => {
      const items = [...entry.specifics.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort(byCountThenName);
      return { category: entry.category, count: entry.count, items, top: items[0] || null };
    })
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const allItems = [...overall.entries()].map(([label, count]) => ({ label, count })).sort(byCountThenName);
  const total = list.reduce((sum, c) => sum + c.count, 0);

  return {
    total,
    categories: list,
    all: { category: 'All', count: total, items: allItems, top: allItems[0] || null },
  };
}
