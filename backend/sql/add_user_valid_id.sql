-- Valid ID fields on mobile users
-- Run once in Supabase: SQL Editor → New query → Run

ALTER TABLE users ADD COLUMN IF NOT EXISTS id_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT;
