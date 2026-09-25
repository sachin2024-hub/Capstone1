/**
 * Renames users.email → users.username using DATABASE_URL from .env
 * Usage: node scripts/migrate-users-email-to-username.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set in backend/.env');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, '..', 'sql', 'rename_users_email_to_username.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = new Pool({ connectionString: url });

  try {
    await pool.query(sql);
    const { rows } = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name IN ('email', 'username')
      ORDER BY column_name
    `);
    console.log('users columns after migration:', rows.map((r) => r.column_name).join(', ') || '(none)');
    console.log('Migration OK: email → username');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
