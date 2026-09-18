/**
 * Migrate responders table:
 * - vehicle (from first/middle/last name)
 * - team (from responder_type → Alpha/Bravo/Charlie)
 * - drop middle_name
 * - drop legacy first_name, last_name, responder_type after copy
 */
require('dotenv').config();
const { getPool } = require('../config/pgClient');

const TEAMS = [
  'Alpha 1', 'Alpha 2', 'Alpha 3', 'Alpha 4',
  'Bravo 1', 'Bravo 2', 'Bravo 3',
  'Charlie 1', 'Charlie 2', 'Charlie 3',
];

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in backend/.env');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const hasVehicle = await columnExists(client, 'responders', 'vehicle');
    const hasTeam = await columnExists(client, 'responders', 'team');
    const hasFirst = await columnExists(client, 'responders', 'first_name');
    const hasMiddle = await columnExists(client, 'responders', 'middle_name');
    const hasLast = await columnExists(client, 'responders', 'last_name');
    const hasType = await columnExists(client, 'responders', 'responder_type');

    if (!hasVehicle) {
      await client.query(`ALTER TABLE responders ADD COLUMN vehicle character varying(100)`);
      console.log('Added column: vehicle');
    }
    if (!hasTeam) {
      await client.query(`ALTER TABLE responders ADD COLUMN team character varying(50)`);
      console.log('Added column: team');
    }

    if (hasFirst || hasLast || hasMiddle) {
      const parts = [];
      if (hasFirst) parts.push(`NULLIF(TRIM(COALESCE(first_name, '')), '')`);
      if (hasMiddle) parts.push(`NULLIF(TRIM(COALESCE(middle_name, '')), '')`);
      if (hasLast) parts.push(`NULLIF(TRIM(COALESCE(last_name, '')), '')`);
      await client.query(`
        UPDATE responders
        SET vehicle = NULLIF(TRIM(BOTH ' ' FROM CONCAT_WS(' ', ${parts.join(', ')})), '')
        WHERE vehicle IS NULL OR TRIM(vehicle) = ''
      `);
      console.log('Backfilled vehicle from name columns');
    }

    if (hasType) {
      await client.query(`
        UPDATE responders
        SET team = CASE
          WHEN responder_type = ANY($1::text[]) THEN responder_type
          ELSE 'Alpha 1'
        END
        WHERE team IS NULL OR TRIM(team) = ''
      `, [TEAMS]);
      console.log('Backfilled team from responder_type (legacy → Alpha 1)');
    } else {
      await client.query(`
        UPDATE responders
        SET team = 'Alpha 1'
        WHERE team IS NULL OR TRIM(team) = ''
      `);
    }

    await client.query(`UPDATE responders SET vehicle = 'Unit ' || responder_id::text WHERE vehicle IS NULL OR TRIM(vehicle) = ''`);

    if (hasMiddle) {
      await client.query(`ALTER TABLE responders DROP COLUMN middle_name`);
      console.log('Dropped column: middle_name');
    }
    if (hasFirst) {
      await client.query(`ALTER TABLE responders DROP COLUMN first_name`);
      console.log('Dropped column: first_name');
    }
    if (hasLast) {
      await client.query(`ALTER TABLE responders DROP COLUMN last_name`);
      console.log('Dropped column: last_name');
    }
    if (hasType) {
      await client.query(`ALTER TABLE responders DROP COLUMN responder_type`);
      console.log('Dropped column: responder_type');
    }

    await client.query('COMMIT');

    const { rows } = await client.query(
      `SELECT responder_id, vehicle, team, contact_number, availability_status FROM responders ORDER BY responder_id`
    );
    console.log('Migration complete. Current responders:');
    console.table(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
