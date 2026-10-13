const supabase = require('../config/supabase');

// ---------------------------------------------------------------------------
// Validation (pure, unit tested)
// ---------------------------------------------------------------------------

const KEY_REGEX = /^[A-Za-z0-9_-]{16,64}$/;
const VALID_PRIORITIES = ['Normal', 'High', 'Critical'];
const MAX_CLIENT_AGE_MS = 24 * 60 * 60 * 1000; // older device timestamps are ignored
const MAX_CLIENT_FUTURE_MS = 5 * 60 * 1000; // device clock ahead of the server

function text(value, max) {
  if (value == null) return { ok: true, value: '' };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

/**
 * Validates and normalises an SOS body. Identity always comes from the token, never the body.
 * Returns { ok: true, value } or { ok: false, field, message }.
 */
function validateSosBody(body, now = Date.now()) {
  const b = body || {};

  let key = null;
  if (b.client_request_id != null && b.client_request_id !== '') {
    if (typeof b.client_request_id !== 'string' || !KEY_REGEX.test(b.client_request_id)) {
      return { ok: false, field: 'client_request_id', message: 'Invalid request id.' };
    }
    key = b.client_request_id;
  }

  const latitude = Number(b.latitude);
  const longitude = Number(b.longitude);
  if (
    b.latitude == null || b.longitude == null || b.latitude === '' || b.longitude === '' ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return { ok: false, field: 'location', message: 'Location is required. Please enable GPS.' };
  }

  const type = text(b.incident_type, 150);
  if (!type.ok) return { ok: false, field: 'incident_type', message: 'Invalid emergency type.' };
  const description = text(b.incident_description, 2000);
  if (!description.ok) return { ok: false, field: 'incident_description', message: 'Description is too long.' };
  const address = text(b.location_address, 500);
  if (!address.ok) return { ok: false, field: 'location_address', message: 'Location text is too long.' };

  // Device time is only trusted inside a sane window; otherwise the server time is used.
  let clientCreatedAt = null;
  if (b.client_created_at) {
    const ms = Date.parse(b.client_created_at);
    if (Number.isFinite(ms) && ms <= now + MAX_CLIENT_FUTURE_MS && ms >= now - MAX_CLIENT_AGE_MS) {
      clientCreatedAt = new Date(Math.min(ms, now)).toISOString();
    }
  }

  return {
    ok: true,
    value: {
      key,
      latitude,
      longitude,
      incident_type: type.value || 'Emergency',
      incident_description: description.value,
      location_address: address.value,
      priority_level: VALID_PRIORITIES.includes(b.priority_level) ? b.priority_level : 'High',
      clientCreatedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const useLocalPg = () => Boolean(String(process.env.DATABASE_URL || '').trim());

const isMissingColumn = (err) => err?.code === '42703';
let warnedMissingSchema = false;
function warnMissingSchema() {
  if (warnedMissingSchema) return;
  warnedMissingSchema = true;
  console.warn(
    '[sos] incidents.client_request_id is missing. Run backend/sql/sos_idempotency.sql in pgAdmin. ' +
    'SOS still works, but retries are NOT duplicate-protected until then.'
  );
}

async function findExisting(userId, key) {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('user_id', userId)
    .eq('client_request_id', key)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) {
      warnMissingSchema();
      return null;
    }
    throw error;
  }
  return data || null;
}

/**
 * Creates the incident + its location exactly once for (userId, key).
 *
 * Local PostgreSQL: one transaction. The unique index (user_id, client_request_id) makes the
 * insert atomic, so concurrent retries can never create two incidents.
 * Other back-ends: unique-violation handling plus location repair on retry.
 *
 * Returns { incident, created }. created=false means this was a duplicate retry.
 */
async function createIncidentOnce(args) {
  try {
    return await createIncidentOnceStrict(args);
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
    // Migration not applied yet: never fail an emergency report because of it.
    warnMissingSchema();
    return createIncidentLegacy(args);
  }
}

// Pre-migration behaviour (no idempotency columns).
async function createIncidentLegacy({ userId, sos, status, description, location }) {
  const { data: incident, error } = await supabase
    .from('incidents')
    .insert([{
      user_id: userId,
      incident_type: sos.incident_type,
      incident_description: description,
      incident_status: status,
      priority_level: sos.priority_level,
    }])
    .select()
    .single();
  if (error) throw error;
  const { error: locErr } = await supabase.from('locations').insert([{
    incident_id: incident.incident_id,
    latitude: sos.latitude,
    longitude: sos.longitude,
    location_address: location.address,
  }]);
  if (locErr) console.error('Location insert error:', locErr.message);
  return { incident, created: true };
}

async function createIncidentOnceStrict({ userId, sos, status, description, location }) {
  const row = {
    user_id: userId,
    incident_type: sos.incident_type,
    incident_description: description,
    incident_status: status,
    priority_level: sos.priority_level,
    client_request_id: sos.key,
    client_created_at: sos.clientCreatedAt,
  };

  if (useLocalPg()) {
    const { getPool } = require('../config/pgClient');
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query(
        `INSERT INTO incidents
           (user_id, incident_type, incident_description, incident_status, priority_level,
            client_request_id, client_created_at, date_reported)
         VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz,
                 COALESCE($7::timestamptz AT TIME ZONE current_setting('TimeZone'), CURRENT_TIMESTAMP))
         ON CONFLICT (user_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
         RETURNING *`,
        [row.user_id, row.incident_type, row.incident_description, row.incident_status,
          row.priority_level, row.client_request_id, row.client_created_at]
      );

      let incident = inserted.rows[0];
      const created = Boolean(incident);
      if (!incident) {
        const existing = await client.query(
          'SELECT * FROM incidents WHERE user_id = $1 AND client_request_id = $2',
          [userId, sos.key]
        );
        incident = existing.rows[0];
        if (!incident) throw new Error('Duplicate SOS could not be loaded.');
      }

      // Idempotent: also repairs an incident whose location was never stored.
      await client.query(
        `INSERT INTO locations (incident_id, latitude, longitude, location_address)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (incident_id) DO NOTHING`,
        [incident.incident_id, sos.latitude, sos.longitude, location.address]
      );

      await client.query('COMMIT');
      return { incident, created };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // Fallback (Supabase client): a unique violation means this is a duplicate retry.
  let created = true;
  let { data: incident, error } = await supabase.from('incidents').insert([row]).select().single();
  if (error && error.code === '23505' && sos.key) {
    created = false;
    incident = await findExisting(userId, sos.key);
    error = incident ? null : error;
  }
  if (error) throw error;

  const { error: locErr } = await supabase.from('locations').insert([{
    incident_id: incident.incident_id,
    latitude: sos.latitude,
    longitude: sos.longitude,
    location_address: location.address,
  }]);
  if (locErr && locErr.code !== '23505') console.error('Location insert error:', locErr.message);

  return { incident, created };
}

module.exports = { validateSosBody, createIncidentOnce, findExisting, KEY_REGEX };
