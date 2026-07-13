-- Cross-device active mode sync (auto-match only, merged via pickStrictestMode).
-- Run in Supabase SQL Editor if you already created context_sync without peer_modes.

alter table context_sync
  add column if not exists peer_modes jsonb not null default '{}'::jsonb;
