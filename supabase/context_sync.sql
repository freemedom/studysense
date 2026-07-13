-- StudyLens context rules sync (WiFi + location rules only).
-- Run in Supabase SQL Editor before using cloud sync.

create table if not exists context_sync (
  sync_token text primary key,
  rules jsonb not null default '[]'::jsonb,
  updated_at bigint not null default 0,
  peer_modes jsonb not null default '{}'::jsonb
);

alter table context_sync enable row level security;

-- MVP: anon can read/write any row; sync_token acts as the shared secret.
-- Tighten RLS before production (e.g. restrict by sync_token claim).
create policy "anon_all" on context_sync for all using (true) with check (true);
