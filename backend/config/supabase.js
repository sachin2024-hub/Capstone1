const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Use service_role key if set — bypasses RLS (Supabase Dashboard > Settings > API)
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(
  process.env.SUPABASE_URL,
  supabaseKey
);

module.exports = supabase;
