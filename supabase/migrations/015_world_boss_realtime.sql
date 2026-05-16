-- Migration 015: Enable Realtime on world_bosses
-- world_bosses was not in the supabase_realtime publication, so postgres_changes
-- listeners on the client never received HP/status updates from other players.
-- Apply this via Supabase Dashboard → SQL Editor.

alter publication supabase_realtime add table public.world_bosses;

-- REPLICA IDENTITY FULL ensures the full row is included in UPDATE payloads,
-- not just the changed columns. Required for postgres_changes filtering.
alter table public.world_bosses replica identity full;
