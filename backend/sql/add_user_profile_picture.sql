-- Optional profile photo column (file copy is also stored on the server)
-- Run once in Supabase: SQL Editor → New query → Run

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT;
