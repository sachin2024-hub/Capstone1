-- Rename users.email → users.username (login identifier)
-- Safe to re-run: skips if username already exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
  ) THEN
    -- Drop unique constraints / indexes tied to email
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'users_email_key' AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE public.users DROP CONSTRAINT users_email_key;
    END IF;

    ALTER TABLE public.users RENAME COLUMN email TO username;
  END IF;
END $$;

DROP INDEX IF EXISTS users_email_idx;
DROP INDEX IF EXISTS users_username_lower_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx
  ON public.users (lower(username));
