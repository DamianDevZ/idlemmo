-- Migration 041: Simplify world — each area IS a biome, loot is per area+tier
-- Drops the area_biomes junction table (and its loot table) that assumed one area
-- could contain multiple biome types. Replaces with a direct area_tier_loot table
-- so admins define what drops in each area at each difficulty tier (T1-T10).

drop table if exists public.area_biome_loot;
drop table if exists public.area_biomes;

-- ─── Loot drops per area × tier ──────────────────────────────────────────────
create table public.area_tier_loot (
  id                  uuid primary key default gen_random_uuid(),
  area_id             uuid not null references public.areas(id)             on delete cascade,
  tier                int  not null check (tier between 1 and 10),
  item_id             uuid not null references public.item_definitions(id)  on delete cascade,
  weight              int  not null default 10,     -- relative frequency
  quantity_min        int  not null default 1,
  quantity_max        int  not null default 3,
  gather_time_ms      int  not null default 5000,
  required_skill_name text,
  unique (area_id, tier, item_id)
);

alter table public.area_tier_loot enable row level security;
create policy "service_role_all"   on public.area_tier_loot for all    to service_role using (true) with check (true);
create policy "authenticated_read" on public.area_tier_loot for select to authenticated  using (true);
