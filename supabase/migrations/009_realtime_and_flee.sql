-- Migration 009: Enable Realtime on exploration_events + add flee_result event type

-- ── 1. Enable Realtime ────────────────────────────────────────────────────────
-- exploration_events was missing from the supabase_realtime publication, so
-- postgres_changes listeners on the client never received any events.
alter publication supabase_realtime add table public.exploration_events;

-- ── 2. Add flee_result to event_type constraint ────────────────────────────────
-- The inline check constraint didn't include flee_result, causing inserts to
-- fail silently when a player chose to flee from an enemy.
alter table public.exploration_events
  drop constraint exploration_events_event_type_check;

alter table public.exploration_events
  add constraint exploration_events_event_type_check
  check (event_type in (
    'resource_found',
    'enemy_encountered',
    'combat_result',
    'flee_result',
    'player_encountered',
    'treasure_found',
    'level_up',
    'collect_prompt',
    'session_ended'
  ));
