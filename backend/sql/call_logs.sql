-- ============================================================
-- ONLY use this if call_logs table does NOT exist yet.
-- If you already have call_logs → use call_logs_alter.sql instead!
-- ============================================================

CREATE TABLE IF NOT EXISTS call_logs (
  call_log_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id       BIGINT,
  admin_id          BIGINT,
  call_time         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  call_duration     INT,
  call_status       VARCHAR(30),
  remarks           TEXT,
  log_date          DATE DEFAULT CURRENT_DATE,
  team              VARCHAR(50) DEFAULT 'ALPHA',
  caller_name       VARCHAR(150),
  time_of_call      VARCHAR(20),
  cp_number         VARCHAR(30),
  nature_of_incident TEXT,
  chief_complaint   TEXT,
  abc_status        VARCHAR(100),
  type_of_code      VARCHAR(50),
  number_of_patients INTEGER DEFAULT 1,
  involve_vehicle   VARCHAR(100),
  location_landmark TEXT,
  hazards           TEXT,
  origin            TEXT,
  destination       TEXT,
  patient_name      VARCHAR(150),
  age               VARCHAR(20),
  address           TEXT,
  contact_no        VARCHAR(30),
  ambulance_no      VARCHAR(50),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_date ON call_logs (log_date DESC);
ALTER TABLE call_logs DISABLE ROW LEVEL SECURITY;
