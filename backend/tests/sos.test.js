// SOS validation (always runs) + idempotency integration tests (run only when TEST_DATABASE_URL is set).
//
//   npm test
//   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/rapidrescue_test npm test
//
// The integration tests need a SEPARATE database that already has the RapidRescue schema and
// backend/sql/sos_idempotency.sql applied, and at least one row in `users`. They never touch
// the DATABASE_URL in .env.
const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_DB = String(process.env.TEST_DATABASE_URL || '').trim();
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-123';

const { validateSosBody } = require('../utils/sosService');

const NOW = Date.parse('2026-10-13T12:00:00Z');
const good = (over = {}) => ({
  client_request_id: 'abcdefgh-12345678-ABCDEFGH',
  incident_type: 'Medical Emergency — Stroke',
  incident_description: 'help',
  latitude: 9.1234,
  longitude: 125.5,
  client_created_at: '2026-10-13T11:58:00Z',
  ...over,
});

test('accepts a valid request and keeps the device timestamp', () => {
  const r = validateSosBody(good(), NOW);
  assert.equal(r.ok, true);
  assert.equal(r.value.key, 'abcdefgh-12345678-ABCDEFGH');
  assert.equal(r.value.clientCreatedAt, '2026-10-13T11:58:00.000Z');
  assert.equal(r.value.priority_level, 'High');
});

test('requests without a key (older app versions) are still accepted', () => {
  const r = validateSosBody(good({ client_request_id: undefined }), NOW);
  assert.equal(r.ok, true);
  assert.equal(r.value.key, null);
});

test('rejects malformed idempotency keys', () => {
  for (const bad of ['short', 'has spaces in the key!!', 'x'.repeat(65), 123, {}]) {
    const r = validateSosBody(good({ client_request_id: bad }), NOW);
    assert.equal(r.ok, false, String(bad));
    assert.equal(r.field, 'client_request_id');
  }
});

test('rejects missing or impossible coordinates', () => {
  for (const [latitude, longitude] of [[null, 125], [9, null], ['abc', 125], [91, 125], [9, 181], [0, 0], ['', '']]) {
    const r = validateSosBody(good({ latitude, longitude }), NOW);
    assert.equal(r.ok, false, `${latitude},${longitude}`);
    assert.equal(r.field, 'location');
  }
});

test('rejects oversized or non-text fields', () => {
  assert.equal(validateSosBody(good({ incident_type: 'x'.repeat(151) }), NOW).ok, false);
  assert.equal(validateSosBody(good({ incident_description: 'x'.repeat(2001) }), NOW).ok, false);
  assert.equal(validateSosBody(good({ incident_type: { a: 1 } }), NOW).ok, false);
});

test('device time outside the trusted window falls back to server time', () => {
  assert.equal(validateSosBody(good({ client_created_at: '2026-10-13T12:30:00Z' }), NOW).value.clientCreatedAt, null);
  assert.equal(validateSosBody(good({ client_created_at: '2026-10-10T12:00:00Z' }), NOW).value.clientCreatedAt, null);
  assert.equal(validateSosBody(good({ client_created_at: 'not a date' }), NOW).value.clientCreatedAt, null);
  // slightly ahead (clock drift) is clamped to "now", never stored in the future
  assert.equal(validateSosBody(good({ client_created_at: '2026-10-13T12:02:00Z' }), NOW).value.clientCreatedAt, '2026-10-13T12:00:00.000Z');
});

test('invalid priority falls back to High and identity in the body is ignored', () => {
  const r = validateSosBody(good({ priority_level: 'Urgent!!', user_id: 999 }), NOW);
  assert.equal(r.value.priority_level, 'High');
  assert.equal('user_id' in r.value, false);
});

// ---------------------------------------------------------------------------
// Integration: needs a real (test) database
// ---------------------------------------------------------------------------
test('idempotency against a test database', { skip: !TEST_DB && 'TEST_DATABASE_URL is not set' }, async (t) => {
  const { getPool } = require('../config/pgClient');
  const { createIncidentOnce, findExisting } = require('../utils/sosService');
  const pool = getPool();
  const { rows } = await pool.query('SELECT user_id FROM users ORDER BY user_id LIMIT 1');
  if (!rows.length) return t.skip('test database has no users');
  const userId = rows[0].user_id;

  const key = `itest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const sos = validateSosBody(good({ client_request_id: key, client_created_at: new Date(Date.now() - 60000).toISOString() })).value;
  const args = { userId, sos, status: 'Pending', description: 'integration test', location: { address: 'test' } };

  try {
    // 8 simultaneous retries of the same request
    const results = await Promise.all(Array.from({ length: 8 }, () => createIncidentOnce(args)));
    assert.equal(results.filter((r) => r.created).length, 1, 'exactly one request creates the incident');
    assert.equal(new Set(results.map((r) => String(r.incident.incident_id))).size, 1, 'all retries see the same incident');

    const count = await pool.query('SELECT count(*)::int n FROM incidents WHERE user_id=$1 AND client_request_id=$2', [userId, key]);
    assert.equal(count.rows[0].n, 1);
    const locs = await pool.query('SELECT count(*)::int n FROM locations WHERE incident_id=$1', [results[0].incident.incident_id]);
    assert.equal(locs.rows[0].n, 1);

    // a later retry (response was lost) is recognised
    assert.ok(await findExisting(userId, key));
    assert.equal((await createIncidentOnce(args)).created, false);

    // the original device time is kept; server receipt is recorded separately
    const row = (await pool.query('SELECT client_created_at, received_at FROM incidents WHERE client_request_id=$1', [key])).rows[0];
    assert.ok(new Date(row.received_at) > new Date(row.client_created_at));
  } finally {
    await pool.query('DELETE FROM incidents WHERE user_id=$1 AND client_request_id=$2', [userId, key]);
    await pool.end();
  }
});
