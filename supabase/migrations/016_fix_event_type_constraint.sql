-- Fix exploration_events event_type constraint to include campsite_reached and recipe_found
-- These event types were added to the TypeScript types but never added to the DB constraint,
-- causing their INSERT calls to fail silently (the check constraint violation returns an error
-- that we weren't checking, so campsites never appeared).

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
      'recipe_found'
    ));
