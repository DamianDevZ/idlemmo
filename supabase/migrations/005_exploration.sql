-- Migration 005: Exploration Sessions & Events
-- Depends on: 001_characters, 003_world

-- ─── Exploration Sessions ─────────────────────────────────────────────────────
create table public.exploration_sessions (
  id                   uuid primary key default gen_random_uuid(),
  character_id         uuid not null references public.characters(id) on delete cascade,
  biome_tier_id        uuid not null references public.biome_tiers(id),
  focus_type           text not null check (focus_type in ('resources','enemies','balanced','treasure')),
  started_at           timestamptz not null default now(),
  last_tick_at         timestamptz not null default now(),
  ends_at              timestamptz,            -- null = no time limit
  retreat_hp_threshold int not null default 20 check (retreat_hp_threshold between 0 and 100), -- % HP
  -- JSON map: { "<item_id>": "always" | "never" | "if_space" }
  collect_preferences  jsonb not null default '{}',
  status               text not null default 'active'
    check (status in ('active','paused','completed','died'))
);

-- Only one active exploration per character at a time
create unique index exploration_one_active_per_char
  on public.exploration_sessions(character_id)
  where status = 'active';

-- ─── Exploration Events ───────────────────────────────────────────────────────
create table public.exploration_events (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.exploration_sessions(id) on delete cascade,
  character_id     uuid not null references public.characters(id) on delete cascade,
  event_type       text not null check (event_type in (
    'resource_found','enemy_encountered','combat_result',
    'player_encountered','treasure_found',
    'level_up','collect_prompt','session_ended'
  )),
  data             jsonb not null default '{}',
  occurred_at      timestamptz not null default now(),
  acknowledged_at  timestamptz   -- null = not yet seen by player
);

-- Index for real-time feed: latest events for a character
create index exploration_events_character_idx
  on public.exploration_events(character_id, occurred_at desc);

-- ─── Database Function: Start Exploration ─────────────────────────────────────
-- Called from Server Action. Validates session state and creates the row.
create or replace function public.start_exploration(
  p_character_id     uuid,
  p_biome_tier_id    uuid,
  p_focus_type       text,
  p_ends_at          timestamptz default null,
  p_retreat_hp_pct   int default 20,
  p_collect_prefs    jsonb default '{}'
)
returns uuid   -- returns new session id
language plpgsql security invoker as $$
declare
  v_session_id uuid;
begin
  -- Ensure no active session already exists
  if exists (
    select 1 from public.exploration_sessions
    where character_id = p_character_id and status = 'active'
  ) then
    raise exception 'Character already has an active exploration session';
  end if;

  insert into public.exploration_sessions
    (character_id, biome_tier_id, focus_type, ends_at, retreat_hp_threshold, collect_preferences)
  values
    (p_character_id, p_biome_tier_id, p_focus_type, p_ends_at, p_retreat_hp_pct, p_collect_prefs)
  returning id into v_session_id;

  return v_session_id;
end;
$$;

-- ─── Database Function: End / Return Home ─────────────────────────────────────
create or replace function public.end_exploration(
  p_session_id   uuid,
  p_character_id uuid,
  p_status       text default 'completed'  -- 'completed' | 'died'
)
returns void
language plpgsql security invoker as $$
begin
  update public.exploration_sessions
  set status = p_status
  where id = p_session_id
    and character_id = p_character_id
    and status = 'active';

  -- Insert a session_ended event so the UI can detect it
  insert into public.exploration_events
    (session_id, character_id, event_type, data)
  values
    (p_session_id, p_character_id, 'session_ended', jsonb_build_object('reason', p_status));
end;
$$;
