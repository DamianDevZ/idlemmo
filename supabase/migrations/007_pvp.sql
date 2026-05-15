-- Migration 007: PvP — Arena & World Bosses
-- Depends on: 001_characters, 003_world

-- ─── Arena Queue ──────────────────────────────────────────────────────────────
create table public.arena_queue (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null unique references public.characters(id) on delete cascade,
  main_level    int  not null,    -- snapshot for matchmaking, avoids join
  queued_at     timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '2 minutes')
);

-- ─── Arena Matches ────────────────────────────────────────────────────────────
create table public.arena_matches (
  id             uuid primary key default gen_random_uuid(),
  player1_id     uuid not null references public.characters(id),
  player2_id     uuid not null references public.characters(id),
  winner_id      uuid references public.characters(id),
  -- JSON array of CombatRound objects
  combat_log     jsonb not null default '[]',
  status         text not null default 'pending'
    check (status in ('pending','in_progress','completed')),
  player1_rating_delta int,
  player2_rating_delta int,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz,
  check (player1_id <> player2_id)
);

-- ─── Arena Ratings ────────────────────────────────────────────────────────────
create table public.arena_ratings (
  character_id   uuid primary key references public.characters(id) on delete cascade,
  rating         int not null default 1000,
  wins           int not null default 0,
  losses         int not null default 0,
  season         int not null default 1,
  updated_at     timestamptz not null default now()
);

create trigger arena_ratings_updated_at
  before update on public.arena_ratings
  for each row execute function public.set_updated_at();

-- ─── World Bosses ─────────────────────────────────────────────────────────────
create table public.world_bosses (
  id              uuid primary key default gen_random_uuid(),
  biome_tier_id   uuid not null references public.biome_tiers(id),
  name            text not null,
  max_hp          int  not null,
  current_hp      int  not null,
  status          text not null default 'scheduled'
    check (status in ('scheduled','queuing','in_progress','completed')),
  spawns_at       timestamptz not null,
  queue_closes_at timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz
);

-- ─── World Boss Participants ──────────────────────────────────────────────────
create table public.world_boss_participants (
  boss_id        uuid not null references public.world_bosses(id) on delete cascade,
  character_id   uuid not null references public.characters(id) on delete cascade,
  damage_dealt   int  not null default 0,
  joined_at      timestamptz not null default now(),
  primary key (boss_id, character_id)
);

-- ─── World Boss Events (shared combat log) ───────────────────────────────────
create table public.world_boss_events (
  id            uuid primary key default gen_random_uuid(),
  boss_id       uuid not null references public.world_bosses(id) on delete cascade,
  event_type    text not null,   -- 'round', 'boss_defeated', 'loot_distributed'
  data          jsonb not null default '{}',
  occurred_at   timestamptz not null default now()
);
