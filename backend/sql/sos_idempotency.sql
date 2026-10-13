-- Offline SOS queue support: idempotent SOS submission.
-- Additive and safe to re-run. Run once in pgAdmin (Query Tool) on the RapidRescue database.
--
-- client_request_id : key generated on the phone; the same key is re-sent on every retry
-- client_created_at : when the user actually pressed HELP (device clock, validated by the API)
-- received_at       : when the server stored the request (NULL for older incidents)

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS client_request_id TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
-- default is applied after the column exists so older rows stay NULL instead of "now"
ALTER TABLE incidents ALTER COLUMN received_at SET DEFAULT NOW();

-- Atomic duplicate protection: one incident per (user, client_request_id).
CREATE UNIQUE INDEX IF NOT EXISTS incidents_user_client_request_uidx
  ON incidents (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
