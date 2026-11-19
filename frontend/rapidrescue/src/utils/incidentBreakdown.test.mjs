import test from 'node:test';
import assert from 'node:assert/strict';
import { specificOf, buildSpecificBreakdown, UNSPECIFIED_LABEL } from './incidentBreakdown.js';

// same idea as the page's incidentCategory(): the part before " — "
const categoryOf = (t) => String(t || '').split(' — ')[0] || 'Other Emergency';
const inc = (type) => ({ incident_type: type });

test('specificOf reads the part after the dash', () => {
  assert.equal(specificOf('Vehicular Accident — Motorcycle vs Tricycle'), 'Motorcycle vs Tricycle');
  assert.equal(specificOf('Fire — House / Building Fire'), 'House / Building Fire');
});

test('a type without detail is "Not specified", never blank', () => {
  assert.equal(specificOf('Fire'), UNSPECIFIED_LABEL);
  assert.equal(specificOf(''), UNSPECIFIED_LABEL);
  assert.equal(specificOf(null), UNSPECIFIED_LABEL);
  assert.equal(specificOf('Fire — '), UNSPECIFIED_LABEL);
});

test('inside one category, specific types are ranked most common first', () => {
  const rows = [
    ...Array(7).fill(inc('Vehicular Accident — Motorcycle vs Tricycle')),
    ...Array(4).fill(inc('Vehicular Accident — Motorcycle vs Motorcycle')),
    ...Array(2).fill(inc('Vehicular Accident — Car vs Car')),
    inc('Fire — Kitchen Fire'),
  ];
  const { categories, total } = buildSpecificBreakdown(rows, categoryOf);
  assert.equal(total, 14);
  const vehicular = categories.find((c) => c.category === 'Vehicular Accident');
  assert.equal(vehicular.count, 13);
  assert.deepEqual(vehicular.items.map((i) => [i.label, i.count]), [
    ['Motorcycle vs Tricycle', 7],
    ['Motorcycle vs Motorcycle', 4],
    ['Car vs Car', 2],
  ]);
  assert.equal(vehicular.top.label, 'Motorcycle vs Tricycle');
});

test('categories are ordered largest first', () => {
  const rows = [inc('Fire — Kitchen Fire'), inc('Medical Emergency — Stroke'), inc('Medical Emergency — Stroke')];
  const { categories } = buildSpecificBreakdown(rows, categoryOf);
  assert.deepEqual(categories.map((c) => c.category), ['Medical Emergency', 'Fire']);
});

test('the "all" view ranks specific types across every category, with their category named', () => {
  const rows = [
    ...Array(3).fill(inc('Fire — Wildfire / Grass Fire')),
    ...Array(5).fill(inc('Medical Emergency — Stroke')),
    inc('Fire'),
  ];
  const { all } = buildSpecificBreakdown(rows, categoryOf);
  assert.equal(all.top.label, 'Medical Emergency — Stroke');
  assert.equal(all.top.count, 5);
  assert.ok(all.items.some((i) => i.label === 'Fire (not specified)' && i.count === 1));
});

test('ties are broken by name so the order never jumps around between refreshes', () => {
  const rows = [inc('Fire — Smoke Only'), inc('Fire — Kitchen Fire')];
  const { categories } = buildSpecificBreakdown(rows, categoryOf);
  assert.deepEqual(categories[0].items.map((i) => i.label), ['Kitchen Fire', 'Smoke Only']);
});

test('no incidents gives an empty, safe result', () => {
  const r = buildSpecificBreakdown([], categoryOf);
  assert.equal(r.total, 0);
  assert.deepEqual(r.categories, []);
  assert.equal(r.all.top, null);
  assert.equal(buildSpecificBreakdown(undefined, categoryOf).total, 0);
});
