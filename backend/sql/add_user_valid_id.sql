-- Valid ID fields on mobile users
-- Run once in pgAdmin / Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS id_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_image TEXT;
