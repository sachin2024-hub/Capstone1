-- Emergency contacts on users table (JSONB array)
-- Run once in Supabase: SQL Editor → New query → Run
--
-- Example value:
-- [
--   { "name": "Maria Santos", "phone_number": "09171234567", "relationship": null },
--   { "name": "Juan Dela Cruz", "phone_number": "09189876543", "relationship": "Brother" }
-- ]

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN users.emergency_contacts IS
  'Optional emergency contacts for the mobile user (max 3). Each item: {name, phone_number, relationship?}';
