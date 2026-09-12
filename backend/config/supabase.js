require('dotenv').config();

/**
 * Database client:
 * - If DATABASE_URL is set → local PostgreSQL (pgAdmin / offline)
 * - Else → Supabase cloud (original)
 */
const useLocal = Boolean(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());

let client;

if (useLocal) {
  const { createPgClient } = require('./pgClient');
  client = createPgClient();
  console.log('[db] Using local PostgreSQL via DATABASE_URL');
} else {
  const { createClient } = require('@supabase/supabase-js');
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  client = createClient(process.env.SUPABASE_URL, supabaseKey);
  console.log('[db] Using Supabase cloud');
}

module.exports = client;
