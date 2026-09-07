-- Optional: run in Supabase SQL Editor if you later want logs in the database.
-- RapidRescue currently stores activity logs locally in backend/data/activity-logs.json
-- so the dashboard works even without this table.

create table if not exists public.activity_logs (
  log_id text primary key,
  created_at timestamptz not null default now(),
  admin_id bigint,
  username text,
  role text,
  action text not null,
  entity_type text,
  entity_id text,
  target text,
  details text
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_action_idx on public.activity_logs (action);

alter table public.activity_logs disable row level security;
