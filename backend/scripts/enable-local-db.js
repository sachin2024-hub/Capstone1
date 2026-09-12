/**
 * Enable local Postgres for RapidRescue.
 * Usage:
 *   node scripts/enable-local-db.js YOUR_LOCAL_POSTGRES_PASSWORD
 *
 * This writes DATABASE_URL into backend/.env so the app uses rapidrescue_db
 * instead of Supabase cloud.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: node scripts/enable-local-db.js YOUR_LOCAL_POSTGRES_PASSWORD');
    process.exit(1);
  }

  const encoded = encodeURIComponent(password);
  const url = `postgresql://postgres:${encoded}@localhost:5432/rapidrescue_db`;

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const names = rows.map((r) => r.table_name);
    console.log(`Connected. Public tables (${names.length}):`, names.join(', ') || '(none)');

    const admins = await client.query('SELECT COUNT(*)::int AS n FROM public.admin');
    console.log(`admin rows: ${admins.rows[0].n}`);
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }

  const envPath = path.join(__dirname, '..', '.env');
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const line = `DATABASE_URL=${url}`;

  if (/^DATABASE_URL=/m.test(text)) {
    text = text.replace(/^#?\s*DATABASE_URL=.*$/m, line);
  } else if (/^#\s*DATABASE_URL=/m.test(text)) {
    text = text.replace(/^#\s*DATABASE_URL=.*$/m, line);
  } else {
    text = `${text.trimEnd()}\n\n# Local Postgres (pgAdmin) — when set, app uses this instead of Supabase\n${line}\n`;
  }

  // Comment out cloud keys reminder stays; keep SUPABASE_* for easy rollback
  fs.writeFileSync(envPath, text);
  console.log('Updated backend/.env with DATABASE_URL');
  console.log('Restart backend: npm run start  (or start:all)');
  console.log('To go back to Supabase: remove or comment DATABASE_URL in .env');
}

main();
