-- Vehicle dispatch records (CDRRMO dispatch sheet)
-- Run in Supabase SQL Editor if dispatch_records does not exist yet.

CREATE TABLE IF NOT EXISTS dispatch_records (
  dispatch_record_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle             VARCHAR(100),
  modulation          VARCHAR(100),
  team_officer        VARCHAR(150),
  on_board            VARCHAR(255),
  time_dispatch       VARCHAR(20),
  dispatch_kmr_fuel   VARCHAR(100),
  time_touchdown      VARCHAR(20),
  touchdown_kmr_fuel  VARCHAR(100),
  log_date            DATE DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_records_date ON dispatch_records (log_date DESC);
ALTER TABLE dispatch_records DISABLE ROW LEVEL SECURITY;
