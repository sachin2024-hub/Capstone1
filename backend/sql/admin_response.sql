-- Admin response message shown to the reporter on the mobile app.
-- Additive and safe to re-run. Run once in pgAdmin (Query Tool) on the RapidRescue database.
--
-- admin_response    : short message the CDRRMO admin sends with a status update
-- admin_response_at : when that message was last set

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS admin_response TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS admin_response_at TIMESTAMPTZ;
