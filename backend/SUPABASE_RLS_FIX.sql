-- ============================================================
-- RUN IN: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- 1) Disable RLS on all tables
ALTER TABLE users       DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin       DISABLE ROW LEVEL SECURITY;
ALTER TABLE responders  DISABLE ROW LEVEL SECURITY;
ALTER TABLE incidents   DISABLE ROW LEVEL SECURITY;
ALTER TABLE locations   DISABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch    DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs   DISABLE ROW LEVEL SECURITY;

-- 2) Verify (rowsecurity = false means RLS is OFF)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users','admin','responders','incidents','locations','dispatch','call_logs');
