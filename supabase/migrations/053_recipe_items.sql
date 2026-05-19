-- Migration 053: Recipe Items
-- Adds recipe type, recipe_for_item_id FK, and app_settings table for text config.
-- Depends on: 004_items, 012_combat_equipment_schema

-- 1. Expand the item type CHECK to include 'recipe'
alter table public.item_definitions
  drop constraint item_definitions_type_check;

alter table public.item_definitions
  add constraint item_definitions_type_check
    check (type in ('material','tool','weapon','armor','consumable','misc','special_attack','recipe'));

-- 2. Add recipe_for_item_id: on recipe scroll items, points to the craftable item.
--    SET NULL on parent delete so deleting the craftable item doesn't cascade-delete inventory.
alter table public.item_definitions
  add column if not exists recipe_for_item_id uuid
    references public.item_definitions(id) on delete set null;

create index if not exists item_definitions_recipe_for_item_id_idx
  on public.item_definitions(recipe_for_item_id);

-- 3. App-level text settings (game_config only stores numeric values)
create table if not exists public.app_settings (
  key         text primary key,
  value       text not null,
  label       text,
  description text,
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Anyone can read settings (needed for client-side rendering)
create policy "app_settings_select_all" on public.app_settings
  for select using (true);

-- Only the service role (admin server actions) can write
create policy "app_settings_service_role_write" on public.app_settings
  for all using (auth.role() = 'service_role');

-- 4. Seed the recipe suffix setting
insert into public.app_settings (key, value, label, description)
values (
  'recipe_suffix',
  'Scroll',
  'Recipe Item Suffix',
  'Word appended after the item display name for recipe scroll items. E.g. "Scroll" → "Iron Sword Scroll".'
)
on conflict (key) do nothing;
