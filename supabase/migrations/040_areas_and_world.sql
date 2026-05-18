-- Migration 040: Areas, World Biome Loot, Structured Enemy Loot
-- Introduces named game-world zones (areas), each at a tier level, with biome
-- environments and per-biome loot tables. Also adds a proper relational loot
-- table for enemies to replace the legacy JSON loot_table column.
-- Depends on: 003_world (biomes), 004_items (item_definitions)

-- ─── Areas ────────────────────────────────────────────────────────────────────
-- A named world zone, e.g. "Verdant Valley" (T1) or "Scorched Wastes" (T4).
create table public.areas (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null unique,        -- machine name: verdant_valley
  display_name text        not null,               -- "Verdant Valley"
  tier         int         not null default 1,
  description  text        not null default '',
  icon         text        not null default '🗺️',
  sort_order   int         not null default 0,
  created_at   timestamptz not null default now()
);

-- ─── Biomes within Areas ──────────────────────────────────────────────────────
-- Each area can contain one or more biome environments (forest, mountains, etc.)
create table public.area_biomes (
  id       uuid primary key default gen_random_uuid(),
  area_id  uuid not null references public.areas(id)  on delete cascade,
  biome_id uuid not null references public.biomes(id) on delete cascade,
  unique (area_id, biome_id)
);

-- ─── Loot drops per area+biome ────────────────────────────────────────────────
-- Defines which items can be gathered in a specific biome within a specific area.
create table public.area_biome_loot (
  id                  uuid primary key default gen_random_uuid(),
  area_biome_id       uuid not null references public.area_biomes(id)     on delete cascade,
  item_id             uuid not null references public.item_definitions(id) on delete cascade,
  weight              int  not null default 10,     -- relative spawn frequency
  quantity_min        int  not null default 1,
  quantity_max        int  not null default 3,
  gather_time_ms      int  not null default 5000,   -- time (ms) per gather action
  required_skill_name text,                          -- e.g. 'woodcutting'; null = any
  unique (area_biome_id, item_id)
);

-- ─── Structured enemy loot ────────────────────────────────────────────────────
-- Relational loot table for enemy drop rewards, replacing the JSON loot_table column.
-- The JSON column is kept in sync automatically by the admin save action for
-- backward-compat with existing arena/combat Postgres functions.
create table public.enemy_loot (
  id            uuid primary key default gen_random_uuid(),
  enemy_type_id uuid not null references public.enemy_types(id)        on delete cascade,
  item_id       uuid not null references public.item_definitions(id) on delete cascade,
  weight        int  not null default 10,
  quantity_min  int  not null default 1,
  quantity_max  int  not null default 1,
  unique (enemy_type_id, item_id)
);

-- ─── Link enemies to areas (nullable for backward compat) ────────────────────
alter table public.enemy_types
  add column area_id uuid references public.areas(id) on delete set null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.areas enable row level security;
create policy "service_role_all"    on public.areas for all    to service_role using (true) with check (true);
create policy "authenticated_read"  on public.areas for select to authenticated  using (true);

alter table public.area_biomes enable row level security;
create policy "service_role_all"    on public.area_biomes for all    to service_role using (true) with check (true);
create policy "authenticated_read"  on public.area_biomes for select to authenticated  using (true);

alter table public.area_biome_loot enable row level security;
create policy "service_role_all"    on public.area_biome_loot for all    to service_role using (true) with check (true);
create policy "authenticated_read"  on public.area_biome_loot for select to authenticated  using (true);

alter table public.enemy_loot enable row level security;
create policy "service_role_all"    on public.enemy_loot for all    to service_role using (true) with check (true);
create policy "authenticated_read"  on public.enemy_loot for select to authenticated  using (true);
