-- Migration 008: Row Level Security
-- Depends on: all previous migrations
-- CRITICAL: All game-relevant tables lock down to auth.uid() → user's character only.

-- ─── Helper function ──────────────────────────────────────────────────────────
-- Returns the character id for the current authenticated user.
-- Using a stable function (not inline subquery) avoids repeated auth lookups.
create or replace function public.my_character_id()
returns uuid language sql stable security definer as $$
  select id from public.characters where user_id = auth.uid() limit 1;
$$;

-- ─── characters ───────────────────────────────────────────────────────────────
alter table public.characters enable row level security;

create policy "characters: read own"
  on public.characters for select to authenticated
  using (user_id = auth.uid());

create policy "characters: insert own"
  on public.characters for insert to authenticated
  with check (user_id = auth.uid());

create policy "characters: update own"
  on public.characters for update to authenticated
  using (user_id = auth.uid());

-- Public read of name + level (for social features)
create policy "characters: public name + level"
  on public.characters for select to authenticated
  using (true);   -- full row visible to all authenticated users (no private data here)

-- ─── character_attributes ─────────────────────────────────────────────────────
alter table public.character_attributes enable row level security;

create policy "attributes: own only"
  on public.character_attributes for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── character_skills ─────────────────────────────────────────────────────────
alter table public.character_skills enable row level security;

create policy "skills: own only"
  on public.character_skills for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── character_category_points ────────────────────────────────────────────────
alter table public.character_category_points enable row level security;

create policy "category_points: own only"
  on public.character_category_points for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── character_inventory ──────────────────────────────────────────────────────
alter table public.character_inventory enable row level security;

create policy "inventory: own only"
  on public.character_inventory for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── character_stash ──────────────────────────────────────────────────────────
alter table public.character_stash enable row level security;

create policy "stash: own only"
  on public.character_stash for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── exploration_sessions ─────────────────────────────────────────────────────
alter table public.exploration_sessions enable row level security;

create policy "exploration_sessions: own only"
  on public.exploration_sessions for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── exploration_events ───────────────────────────────────────────────────────
alter table public.exploration_events enable row level security;

create policy "exploration_events: own only"
  on public.exploration_events for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── friend_requests ──────────────────────────────────────────────────────────
alter table public.friend_requests enable row level security;

create policy "friend_requests: see sent or received"
  on public.friend_requests for select to authenticated
  using (
    from_character_id = public.my_character_id()
    or to_character_id = public.my_character_id()
  );

create policy "friend_requests: insert own"
  on public.friend_requests for insert to authenticated
  with check (from_character_id = public.my_character_id());

create policy "friend_requests: update received"
  on public.friend_requests for update to authenticated
  using (to_character_id = public.my_character_id());

-- ─── friends ──────────────────────────────────────────────────────────────────
alter table public.friends enable row level security;

create policy "friends: own only"
  on public.friends for select to authenticated
  using (character_id = public.my_character_id());

-- ─── arena_queue ──────────────────────────────────────────────────────────────
alter table public.arena_queue enable row level security;

create policy "arena_queue: own only"
  on public.arena_queue for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── arena_matches ────────────────────────────────────────────────────────────
alter table public.arena_matches enable row level security;

create policy "arena_matches: participants only"
  on public.arena_matches for select to authenticated
  using (
    player1_id = public.my_character_id()
    or player2_id = public.my_character_id()
  );

-- ─── arena_ratings ────────────────────────────────────────────────────────────
alter table public.arena_ratings enable row level security;

-- Ratings are public (leaderboard)
create policy "arena_ratings: public read"
  on public.arena_ratings for select to authenticated using (true);

create policy "arena_ratings: own write"
  on public.arena_ratings for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── world_bosses ─────────────────────────────────────────────────────────────
alter table public.world_bosses enable row level security;

-- Bosses are public (everyone can see upcoming bosses)
create policy "world_bosses: public read"
  on public.world_bosses for select to authenticated using (true);

-- ─── world_boss_participants ──────────────────────────────────────────────────
alter table public.world_boss_participants enable row level security;

create policy "boss_participants: own only"
  on public.world_boss_participants for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── world_boss_events ───────────────────────────────────────────────────────
alter table public.world_boss_events enable row level security;

-- Participants can see events for bosses they joined
create policy "boss_events: participants"
  on public.world_boss_events for select to authenticated
  using (
    exists (
      select 1 from public.world_boss_participants wbp
      where wbp.boss_id = world_boss_events.boss_id
        and wbp.character_id = public.my_character_id()
    )
  );

-- ─── Static / reference tables: read-only for all authenticated users ─────────
alter table public.skill_categories        enable row level security;
alter table public.skills                  enable row level security;
alter table public.biomes                  enable row level security;
alter table public.biome_tiers             enable row level security;
alter table public.enemy_types             enable row level security;
alter table public.item_definitions        enable row level security;
alter table public.recipes                 enable row level security;
alter table public.biome_tier_resources    enable row level security;

create policy "skill_categories: read" on public.skill_categories for select to authenticated using (true);
create policy "skills: read"           on public.skills            for select to authenticated using (true);
create policy "biomes: read"           on public.biomes            for select to authenticated using (true);
create policy "biome_tiers: read"      on public.biome_tiers       for select to authenticated using (true);
create policy "enemy_types: read"      on public.enemy_types       for select to authenticated using (true);
create policy "item_defs: read"        on public.item_definitions  for select to authenticated using (true);
create policy "recipes: read"          on public.recipes           for select to authenticated using (true);
create policy "biome_resources: read"  on public.biome_tier_resources for select to authenticated using (true);
