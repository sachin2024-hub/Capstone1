-- ============================================================
-- RUN IN: Supabase Dashboard → SQL Editor → New query → Run
-- Use this if call_logs table ALREADY EXISTS (your current schema)
-- ============================================================

-- Your existing columns (already in DB):
--   call_log_id, incident_id, admin_id, call_time, call_duration, call_status, remarks

-- 1) Make incident_id & admin_id optional (manual call log entries may not have these)
ALTER TABLE call_logs ALTER COLUMN incident_id DROP NOT NULL;
ALTER TABLE call_logs ALTER COLUMN admin_id DROP NOT NULL;

-- 2) Add Call Log form columns (Cabadbaran CDRRMO paper form)
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS log_date          DATE DEFAULT CURRENT_DATE;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS team              VARCHAR(50) DEFAULT 'ALPHA';
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS caller_name       VARCHAR(150);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS time_of_call      VARCHAR(20);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS cp_number         VARCHAR(30);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS nature_of_incident TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS chief_complaint   TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS abc_status        VARCHAR(100);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS type_of_code      VARCHAR(50);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS number_of_patients INTEGER DEFAULT 1;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS involve_vehicle   VARCHAR(100);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS location_landmark TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS hazards           TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS origin            TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS destination       TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS patient_name      VARCHAR(150);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS age               VARCHAR(20);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS address           TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS contact_no        VARCHAR(30);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS ambulance_no      VARCHAR(50);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- 3) Backfill log_date from existing call_time (if any rows exist)
UPDATE call_logs
SET log_date = call_time::date
WHERE log_date IS NULL AND call_time IS NOT NULL;

UPDATE call_logs
SET time_of_call = TO_CHAR(call_time, 'HH24:MI')
WHERE time_of_call IS NULL AND call_time IS NOT NULL;

-- 4) Index for date/team filtering
CREATE INDEX IF NOT EXISTS idx_call_logs_date ON call_logs (log_date DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_team ON call_logs (team);

-- 5) Disable RLS (if not already)
ALTER TABLE call_logs DISABLE ROW LEVEL SECURITY;

-- 6) Verify columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'call_logs'
ORDER BY ordinal_position;
