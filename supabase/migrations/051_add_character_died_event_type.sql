-- Add character_died to the exploration_events event_type constraint.
-- The TypeScript EventType union was updated but the DB check was never patched,
-- meaning any death event insert would fail with a constraint violation at runtime.

alter table public.exploration_events
  drop constraint if exists exploration_events_event_type_check;

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
      'session_ended',
      'campsite_reached',
      'recipe_found',
      'character_died'
    ));
