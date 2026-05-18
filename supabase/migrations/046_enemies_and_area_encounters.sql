-- Migration 046: New enemies system with per-tier loot and area encounters

-- ─── Enemy templates ──────────────────────────────────────────────────────────
create table public.enemies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  display_name text not null,
  description text not null default '',
  icon        text not null default '👹',
  sort_order  int  not null default 0
);

alter table public.enemies enable row level security;
create policy "service_role_all"   on public.enemies for all    to service_role using (true) with check (true);
create policy "authenticated_read" on public.enemies for select to authenticated  using (true);

-- ─── Enemy loot drops per tier ────────────────────────────────────────────────
create table public.enemy_tier_loot (
  id        uuid primary key default gen_random_uuid(),
  enemy_id  uuid not null references public.enemies(id) on delete cascade,
  tier      int  not null check (tier between 1 and 10),
  item_id   uuid not null references public.item_definitions(id) on delete cascade,
  item_tier int       check (item_tier between 1 and 10),
  weight    int  not null default 10,
  unique (enemy_id, tier, item_id)
);

alter table public.enemy_tier_loot enable row level security;
create policy "service_role_all"   on public.enemy_tier_loot for all    to service_role using (true) with check (true);
create policy "authenticated_read" on public.enemy_tier_loot for select to authenticated  using (true);

-- ─── Enemy encounters per area × tier ────────────────────────────────────────
create table public.area_tier_enemies (
  id       uuid primary key default gen_random_uuid(),
  area_id  uuid not null references public.areas(id)   on delete cascade,
  tier     int  not null check (tier between 1 and 10),
  enemy_id uuid not null references public.enemies(id) on delete cascade,
  weight   int  not null default 10,
  unique (area_id, tier, enemy_id)
);

alter table public.area_tier_enemies enable row level security;
create policy "service_role_all"   on public.area_tier_enemies for all    to service_role using (true) with check (true);
create policy "authenticated_read" on public.area_tier_enemies for select to authenticated  using (true);
