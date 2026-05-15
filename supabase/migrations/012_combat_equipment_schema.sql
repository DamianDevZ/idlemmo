-- Migration 012: Combat & Equipment Schema
-- Adds: armor presets, damage type system, equipment tiers, per-instance item ratings,
--       attribute scaling on items, special attack scrolls, rage meter on sessions
-- Depends on: 001_characters, 003_world, 004_items, 005_exploration

-- ─── 1. Restructure character_inventory for per-instance items ────────────────
-- Currently PK is (character_id, item_id) — one row per item type per character.
-- Adding instance_id allows a character to own multiple copies of the same equipment
-- at different ratings (e.g. two Iron Swords: one B-rated, one D-rated).
-- Stackable materials still use a single row with quantity > 1; equipment uses quantity = 1
-- with a unique instance per row.

alter table public.character_inventory
  add column instance_id uuid not null default gen_random_uuid();

alter table public.character_inventory
  drop constraint character_inventory_pkey;

alter table public.character_inventory
  add primary key (instance_id);

-- Item rating: null for stackable materials, S/A/B/C/D/F for equipment instances
alter table public.character_inventory
  add column item_rating text check (item_rating in ('S','A','B','C','D','F'));

-- ─── 2. Restructure character_stash identically ───────────────────────────────
alter table public.character_stash
  add column instance_id uuid not null default gen_random_uuid();

alter table public.character_stash
  drop constraint character_stash_pkey;

alter table public.character_stash
  add primary key (instance_id);

alter table public.character_stash
  add column item_rating text check (item_rating in ('S','A','B','C','D','F'));

-- ─── 3. Expand item_definitions ───────────────────────────────────────────────

-- Rename tool_tier → equipment_tier so it applies universally to weapons, armor, and tools.
-- Biome tier gates still use required_tool_tier on biome_tiers (separate column, unchanged).
alter table public.item_definitions
  rename column tool_tier to equipment_tier;

-- Material type: determines which armor resistance profile applies when worn.
-- null = not wearable (materials, consumables, misc)
alter table public.item_definitions
  add column material_type text check (material_type in ('metal','leather','cloth'));

-- Primary damage type for weapons. null = not a weapon.
alter table public.item_definitions
  add column primary_damage_type text check (primary_damage_type in (
    'slash','blunt','bleed','pierce','fire','ice','lightning','poison','true'
  ));

-- Flat base combat values (replaces stats->>'weapon_damage' / stats->>'armor_rating').
-- base_damage  = weapon raw damage before attribute scaling
-- base_defense = armor damage reduction before attribute scaling
alter table public.item_definitions
  add column base_damage  numeric(8,2),
  add column base_defense numeric(8,2);

-- Attribute scaling.
-- primary_scaling_attr:  which attribute primarily scales this item ('str','dex','int')
-- primary_scaling_grade: how strongly (S=50% of stat, A=40%, B=30%, C=20%, D=10%, F=2%)
-- secondary_*: second scaling slot, only populated on T3+ items
alter table public.item_definitions
  add column primary_scaling_attr    text check (primary_scaling_attr   in ('str','dex','int')),
  add column primary_scaling_grade   text check (primary_scaling_grade  in ('S','A','B','C','D','F')),
  add column secondary_scaling_attr  text check (secondary_scaling_attr  in ('str','dex','int')),
  add column secondary_scaling_grade text check (secondary_scaling_grade in ('S','A','B','C','D','F'));

alter table public.item_definitions
  add constraint item_secondary_needs_primary
    check (secondary_scaling_attr is null or primary_scaling_attr is not null);

-- Expand item type to include special_attack scrolls
alter table public.item_definitions
  drop constraint item_definitions_type_check;

alter table public.item_definitions
  add constraint item_definitions_type_check
    check (type in ('material','tool','weapon','armor','consumable','misc','special_attack'));

-- ─── 4. Migrate existing stats jsonb → dedicated columns ──────────────────────

-- Weapons: pull weapon_damage out of stats blob
update public.item_definitions
  set base_damage = (stats->>'weapon_damage')::numeric
  where type = 'weapon'
    and stats->>'weapon_damage' is not null;

-- Armor: pull armor_rating out of stats blob
update public.item_definitions
  set base_defense = (stats->>'armor_rating')::numeric
  where type = 'armor'
    and stats->>'armor_rating' is not null;

-- Set equipment_tier = 1 for all existing weapons and armor (had no tier before)
update public.item_definitions
  set equipment_tier = 1
  where type in ('weapon','armor')
    and equipment_tier is null;

-- Set material type and damage type for existing seeded weapons
update public.item_definitions set
  material_type        = 'metal',
  primary_damage_type  = 'pierce',
  primary_scaling_attr  = 'str',
  primary_scaling_grade = 'F'
  where name = 'crude_knife';

update public.item_definitions set
  material_type        = 'metal',
  primary_damage_type  = 'pierce',
  primary_scaling_attr  = 'str',
  primary_scaling_grade = 'D'
  where name = 'iron_dagger';

-- Set material type for existing seeded armor
update public.item_definitions set material_type = 'leather'
  where name in ('hide_vest','hide_leggings');

-- ─── 5. Armor Presets ─────────────────────────────────────────────────────────
-- Named resistance profiles assigned to enemies and matched to player armor material.
-- Resistance values: positive int = % damage reduced, negative = % extra damage taken.
-- All 8 damage types covered: slash, blunt, bleed, pierce, fire, ice, lightning, poison.

create table public.armor_presets (
  id           text primary key,      -- short slug: 'leather', 'plate', 'stone_hide' etc.
  display_name text not null,
  material_type text check (material_type in ('metal','leather','cloth','none')),
  resistances  jsonb not null default '{}'
);

insert into public.armor_presets (id, display_name, material_type, resistances) values
  ('unarmored',    'Unarmored',    'none',
    '{"slash":0,"blunt":0,"pierce":0,"bleed":0,"fire":0,"ice":0,"lightning":0,"poison":0}'),
  ('leather',      'Leather',      'leather',
    '{"slash":15,"blunt":30,"pierce":20,"bleed":-15,"fire":-15,"ice":0,"lightning":0,"poison":10}'),
  ('plate',        'Plate',        'metal',
    '{"slash":40,"blunt":20,"pierce":-30,"bleed":30,"fire":10,"ice":10,"lightning":-20,"poison":0}'),
  ('chainmail',    'Chainmail',    'metal',
    '{"slash":30,"blunt":10,"pierce":-20,"bleed":25,"fire":5,"ice":5,"lightning":-25,"poison":0}'),
  ('cloth',        'Cloth',        'cloth',
    '{"slash":-10,"blunt":-5,"pierce":-10,"bleed":-20,"fire":30,"ice":30,"lightning":30,"poison":20}'),
  ('stone_hide',   'Stone Hide',   'none',
    '{"slash":60,"blunt":35,"pierce":50,"bleed":80,"fire":-20,"ice":20,"lightning":-40,"poison":0}'),
  ('beast_fur',    'Beast Fur',    'none',
    '{"slash":10,"blunt":15,"pierce":5,"bleed":-35,"fire":-40,"ice":0,"lightning":0,"poison":-20}'),
  ('scaled',       'Scaled Hide',  'none',
    '{"slash":35,"blunt":20,"pierce":30,"bleed":10,"fire":60,"ice":-40,"lightning":0,"poison":-10}'),
  ('undead',       'Undead',       'none',
    '{"slash":20,"blunt":15,"pierce":20,"bleed":100,"fire":-60,"ice":30,"lightning":0,"poison":100}'),
  ('arcane_shell', 'Arcane Shell', 'none',
    '{"slash":10,"blunt":10,"pierce":10,"bleed":0,"fire":45,"ice":-25,"lightning":45,"poison":-30}');

-- ─── 6. Assign armor presets to enemy types ───────────────────────────────────

alter table public.enemy_types
  add column armor_preset_id text references public.armor_presets(id) not null default 'unarmored';

-- Forest
update public.enemy_types set armor_preset_id = 'beast_fur'  where name = 'young_wolf';
update public.enemy_types set armor_preset_id = 'leather'    where name = 'forest_goblin';
update public.enemy_types set armor_preset_id = 'leather'    where name = 'bandit';
update public.enemy_types set armor_preset_id = 'beast_fur'  where name = 'brown_bear';
-- Mountains
update public.enemy_types set armor_preset_id = 'beast_fur'  where name = 'mountain_goat';
update public.enemy_types set armor_preset_id = 'unarmored'  where name = 'rock_rat';
update public.enemy_types set armor_preset_id = 'stone_hide' where name = 'mountain_troll';
-- Swamp
update public.enemy_types set armor_preset_id = 'unarmored'  where name = 'swamp_frog';
update public.enemy_types set armor_preset_id = 'unarmored'  where name = 'slime';
-- Desert
update public.enemy_types set armor_preset_id = 'scaled'     where name = 'scorpion';
-- Ruins
update public.enemy_types set armor_preset_id = 'undead'     where name = 'undead_shambler';
-- Volcanic
update public.enemy_types set armor_preset_id = 'scaled'     where name = 'fire_lizard';

-- ─── 7. Special Attack Scrolls ────────────────────────────────────────────────
-- Scrolls exist as item_definitions rows (type='special_attack') so they can be
-- found as loot, sit in inventory/stash, and be traded.
-- This companion table holds the mechanical data: what damage the attack deals.

create table public.special_attack_scrolls (
  id           uuid primary key default gen_random_uuid(),
  -- Links to the item_definitions row that represents this scroll as an inventory item
  item_id      uuid not null unique references public.item_definitions(id) on delete cascade,
  -- 'melee' = only equippable on melee weapons, 'ranged' = ranged/staves, 'any' = universal
  weapon_type  text not null check (weapon_type in ('melee','ranged','any')),
  -- How full the rage meter must be to trigger (0–200; 100 = one full bar)
  rage_cost    int  not null default 100 check (rage_cost between 1 and 200),
  -- Damage formula: array of { damage_type: string, percent_of_base: number }
  -- e.g. [{"damage_type":"slash","percent_of_base":1.2},{"damage_type":"fire","percent_of_base":0.8}]
  -- Total output = sum of (weapon base_damage × percent_of_base) per component, scaled by attributes
  components   jsonb not null default '[]',
  description  text not null default ''
);

-- ─── 8. Character special attack ownership & binding ─────────────────────────
-- Tracks which scrolls a player owns and which weapon instance each is bound to.
-- Binding is done at the blacksmith (same screen as tier merging).

create table public.character_special_attacks (
  id               uuid primary key default gen_random_uuid(),
  character_id     uuid not null references public.characters(id) on delete cascade,
  scroll_id        uuid not null references public.special_attack_scrolls(id),
  -- instance_id of the weapon in character_inventory this is bound to; null = unbound
  bound_instance_id uuid,
  acquired_at      timestamptz not null default now(),
  unique (character_id, scroll_id)
);

-- ─── 9. Rage meter on exploration sessions ────────────────────────────────────
-- Rage fills as the player takes hits during combat (0–100).
-- When it reaches 100 and the player has a bound special attack, it fires automatically
-- and the meter resets to 0. Persists across encounters within the same run.

alter table public.exploration_sessions
  add column current_rage int not null default 0 check (current_rage between 0 and 100);
