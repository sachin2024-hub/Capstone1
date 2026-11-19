import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfflineDelay, formatDelay, OFFLINE_DELAY_MS } from './offlineSos.js';

const t0 = '2026-11-19T10:00:00.000Z';
const plus = (ms) => new Date(Date.parse(t0) + ms).toISOString();

test('a normal online SOS (a few seconds) is not marked offline', () => {
  assert.equal(getOfflineDelay({ client_created_at: t0, received_at: plus(4000) }), null);
});

test('just under the threshold is not offline, at the threshold it is', () => {
  assert.equal(getOfflineDelay({ client_created_at: t0, received_at: plus(OFFLINE_DELAY_MS - 1) }), null);
  assert.ok(getOfflineDelay({ client_created_at: t0, received_at: plus(OFFLINE_DELAY_MS) }));
});

test('a delayed SOS reports the delay', () => {
  const d = getOfflineDelay({ client_created_at: t0, received_at: plus(12 * 60000) });
  assert.equal(d.label, '12 min');
  assert.equal(d.ms, 12 * 60000);
});

test('older incidents without the new columns never show the badge', () => {
  assert.equal(getOfflineDelay({ client_created_at: null, received_at: null }), null);
  assert.equal(getOfflineDelay({ client_created_at: t0 }), null);
  assert.equal(getOfflineDelay({ received_at: t0 }), null);
  assert.equal(getOfflineDelay(null), null);
  assert.equal(getOfflineDelay(undefined), null);
});

test('invalid dates and a clock-skewed (negative) gap are ignored', () => {
  assert.equal(getOfflineDelay({ client_created_at: 'nope', received_at: t0 }), null);
  assert.equal(getOfflineDelay({ client_created_at: plus(5 * 60000), received_at: t0 }), null);
});

test('formatDelay is readable', () => {
  assert.equal(formatDelay(30_000), '1 min');
  assert.equal(formatDelay(45 * 60000), '45 min');
  assert.equal(formatDelay(90 * 60000), '1h 30m');
  assert.equal(formatDelay(26 * 3600000), '1d 2h');
});
