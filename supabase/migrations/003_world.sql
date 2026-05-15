-- Migration 003: World — Biomes, Tiers, Resources, Enemies
-- Depends on: 001_characters

-- ─── Biomes ───────────────────────────────────────────────────────────────────
create table public.biomes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,   -- forest | mountains | swamp | desert | ruins | ocean | volcanic
  display_name text not null,
  description  text not null default '',
  icon         text not null default '🌍'
);

-- ─── Biome Tiers (difficulty bands within each biome) ────────────────────────
-- Tier 1–5. Requirements mirror GAME_CONFIG.tierGates.
create table public.biome_tiers (
  id                    uuid primary key default gen_random_uuid(),
  biome_id              uuid not null references public.biomes(id),
  tier                  int  not null check (tier between 1 and 5),
  display_name          text not null,
  description           text not null default '',
  -- Access gates (validated server-side using game.config values)
  required_skill_level  int  not null default 0,
  required_tool_tier    int  not null default 0,
  required_attribute    jsonb,         -- { "stat": "strength", "value": 15 } or null
  -- Enemy scaling for this tier
  enemy_level_min       int  not null default 1,
  enemy_level_max       int  not null default 5,
  unique (biome_id, tier)
);

-- ─── Enemy Types ──────────────────────────────────────────────────────────────
create table public.enemy_types (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  display_name    text not null,
  biome_id        uuid references public.biomes(id),  -- null = found anywhere
  tier            int  not null default 1 check (tier between 1 and 5),
  level           int  not null default 1,
  base_hp         int  not null default 20,
  base_attack     int  not null default 3,
  base_armor      int  not null default 0,
  base_speed      numeric(4,2) not null default 1.0, -- attacks per round relative to player
  xp_reward       int  not null default 10,
  -- JSON array of { item_id (name ref), weight, quantity_min, quantity_max }
  loot_table      jsonb not null default '[]'
);

-- ─── Location Resources (what can be found in each biome tier) ───────────────
-- item_definition_name references items seeded in migration 004
create table public.biome_tier_resources (
  id                    uuid primary key default gen_random_uuid(),
  biome_tier_id         uuid not null references public.biome_tiers(id),
  item_name             text not null,  -- resolved to item_id after migration 004
  base_yield_min        int  not null default 1,
  base_yield_max        int  not null default 3,
  base_gather_time_ms   int  not null default 5000,  -- base tick duration in ms
  base_rare_chance      numeric(5,4) not null default 0.05, -- 0–1
  required_skill_name   text not null,  -- e.g. 'wood_chopping'
  spawn_weight          int  not null default 10  -- relative frequency vs other resources
);

-- ─── Seed: Biomes ─────────────────────────────────────────────────────────────
insert into public.biomes (name, display_name, description, icon) values
  ('forest',    'Forest',    'Ancient woodland filled with timber and wildlife.',        '🌲'),
  ('mountains', 'Mountains', 'Rocky peaks hiding veins of ore and mineral deposits.',    '⛰️'),
  ('swamp',     'Swamp',     'Murky wetlands rich in rare herbs and strange creatures.', '🌿'),
  ('desert',    'Desert',    'Scorching sands concealing precious minerals and ruins.',  '🏜️'),
  ('ruins',     'Ruins',     'Crumbling structures guarding ancient artefacts.',         '🏛️'),
  ('ocean',     'Ocean',     'Deep waters teeming with fish and sea creatures.',         '🌊'),
  ('volcanic',  'Volcanic',  'Molten terrain yielding the rarest and hardest ores.',    '🌋');

-- ─── Seed: Biome Tiers ────────────────────────────────────────────────────────
-- Tier gates: T1=skill 0/tool 0, T2=skill 10/tool 2, T3=skill 25/tool 3+STR≥15,
--             T4=skill 50/tool 4+STR≥30, T5=skill 75/tool 5+STR≥50
with b as (select id, name from public.biomes)
insert into public.biome_tiers
  (biome_id, tier, display_name, description,
   required_skill_level, required_tool_tier, required_attribute,
   enemy_level_min, enemy_level_max)
select b.id, t.tier, t.display_name, t.description,
       t.req_skill, t.req_tool, t.req_attr::jsonb,
       t.enemy_min, t.enemy_max
from b
join (values
  -- Forest
  ('forest',    1, 'Young Forest',   'Pine and birch, with small wolves roaming.',              0,  0, null,             1,  5),
  ('forest',    2, 'Common Forest',  'Oak and elm. Bandits lurk in the shadows.',               10, 2, null,             5, 12),
  ('forest',    3, 'Old Growth',     'Hardwood giants. Bears and forest spirits guard them.',   25, 3, '{"stat":"strength","value":15}', 12, 25),
  ('forest',    4, 'Ancient Forest', 'Crystalwood trees. Ancient guardians patrol.',            50, 4, '{"stat":"strength","value":30}', 25, 45),
  ('forest',    5, 'Primal Forest',  'Spirit Wood. Forest dragons nest here.',                  75, 5, '{"stat":"strength","value":50}', 45, 70),
  -- Mountains
  ('mountains', 1, 'Rocky Foothills','Copper and tin deposits. Mountain goats.',                0,  0, null,             1,  5),
  ('mountains', 2, 'Highlands',      'Iron ore. Trolls and bandits roam freely.',               10, 2, null,             5, 12),
  ('mountains', 3, 'Deep Peaks',     'Steel-grade ore. Stone elementals awaken.',              25, 3, '{"stat":"strength","value":15}', 12, 25),
  ('mountains', 4, 'Glacial Heights','Silver and mithril veins. Frost giants.',                 50, 4, '{"stat":"strength","value":30}', 25, 45),
  ('mountains', 5, 'Summit Vault',   'Adamantite. Rock dragons guard the highest peaks.',       75, 5, '{"stat":"strength","value":50}', 45, 70),
  -- Swamp
  ('swamp',     1, 'Marsh Edge',     'Basic herbs and reeds. Frogs and slimes.',                0,  0, null,             1,  5),
  ('swamp',     2, 'Murky Depths',   'Uncommon plants. Alligators and hags.',                  10, 2, null,             5, 12),
  ('swamp',     3, 'Cursed Bog',     'Alchemical roots. Witches and bog spirits.',              25, 3, '{"stat":"strength","value":15}', 12, 25),
  ('swamp',     4, 'Sunken Ruins',   'Ancient reagents. Drowned knights.',                      50, 4, '{"stat":"strength","value":30}', 25, 45),
  ('swamp',     5, 'Abyssal Mire',   'Primal essence. Ancient marsh leviathans.',               75, 5, '{"stat":"strength","value":50}', 45, 70),
  -- Desert
  ('desert',    1, 'Dune Flats',     'Sandstone and copper dust. Scorpions.',                   0,  0, null,             1,  5),
  ('desert',    2, 'Sand Sea',       'Rare minerals. Sand worms burrow beneath.',              10, 2, null,             5, 12),
  ('desert',    3, 'Burning Wastes', 'Desert crystals. Fire lizards and nomad bandits.',        25, 3, '{"stat":"strength","value":15}', 12, 25),
  ('desert',    4, 'Glass Plains',   'Obsidian shards. Sand wyverns circle above.',             50, 4, '{"stat":"strength","value":30}', 25, 45),
  ('desert',    5, 'Scorched Vault', 'Sunfire gems. Ancient desert titans.',                    75, 5, '{"stat":"strength","value":50}', 45, 70),
  -- Ruins
  ('ruins',     1, 'Outer Rubble',   'Salvageable stone and minor trinkets. Undead shamblers.',0,  0, null,             1,  5),
  ('ruins',     2, 'Collapsed Hall', 'Old coins and blades. Skeleton warriors.',               10, 2, null,             5, 12),
  ('ruins',     3, 'Inner Sanctum',  'Ancient relics. Golems and spectres.',                   25, 3, '{"stat":"strength","value":15}', 12, 25),
  ('ruins',     4, 'Vault Chamber',  'Artefacts and enchanted components. Wraiths.',            50, 4, '{"stat":"strength","value":30}', 25, 45),
  ('ruins',     5, 'Lich''s Throne', 'Legendary relics. The Lich and its undead court.',       75, 5, '{"stat":"strength","value":50}', 45, 70),
  -- Ocean
  ('ocean',     1, 'Shallow Shore',  'Common fish and clams. Sea crabs.',                       0,  0, null,             1,  5),
  ('ocean',     2, 'Open Water',     'Larger fish and shellfish. Sharks.',                      10, 2, null,             5, 12),
  ('ocean',     3, 'Deep Current',   'Rare fish. Sea serpents emerge.',                         25, 3, '{"stat":"strength","value":15}', 12, 25),
  ('ocean',     4, 'Abyssal Shelf',  'Deep-sea creatures. Giant squid.',                        50, 4, '{"stat":"strength","value":30}', 25, 45),
  ('ocean',     5, 'The Deep',       'Mythic sea life. The Kraken stirs.',                      75, 5, '{"stat":"strength","value":50}', 45, 70),
  -- Volcanic
  ('volcanic',  1, 'Lava Fields',    'Sulfur ore and ash. Fire lizards.',                       0,  0, null,             1,  5),
  ('volcanic',  2, 'Magma Shelf',    'Iron and coal near lava flows. Magma slugs.',            10, 2, null,             5, 12),
  ('volcanic',  3, 'Caldara Rim',    'Steel-grade ore and fire gems. Lava elementals.',         25, 3, '{"stat":"strength","value":15}', 12, 25),
  ('volcanic',  4, 'Ember Core',     'Mithril veins. Fire golems guard the depths.',            50, 4, '{"stat":"strength","value":30}', 25, 45),
  ('volcanic',  5, 'Primordial Vent','Mythril and fire crystals. Ancient lava dragons.',        75, 5, '{"stat":"strength","value":50}', 45, 70)
) as t(biome_name, tier, display_name, description, req_skill, req_tool, req_attr, enemy_min, enemy_max)
  on b.name = t.biome_name;

-- ─── Seed: Enemy Types ────────────────────────────────────────────────────────
with b as (select id, name from public.biomes)
insert into public.enemy_types
  (name, display_name, biome_id, tier, level, base_hp, base_attack, base_armor, base_speed, xp_reward, loot_table)
values
  -- Forest T1
  ('young_wolf',     'Young Wolf',      (select id from b where name='forest'),    1,  2,  15, 3,  0, 1.2, 10, '[{"item":"wolf_pelt","weight":5,"min":1,"max":1},{"item":"raw_meat","weight":8,"min":1,"max":2}]'),
  ('forest_goblin',  'Forest Goblin',   (select id from b where name='forest'),    1,  3,  18, 4,  2, 1.0, 12, '[{"item":"copper_coin","weight":8,"min":2,"max":8},{"item":"crude_knife","weight":2,"min":1,"max":1}]'),
  -- Forest T2
  ('bandit',         'Bandit',          (select id from b where name='forest'),    2,  8,  45, 9,  5, 1.0, 30, '[{"item":"copper_coin","weight":6,"min":10,"max":30},{"item":"iron_dagger","weight":2,"min":1,"max":1}]'),
  ('brown_bear',     'Brown Bear',      (select id from b where name='forest'),    2, 10,  80,14,  3, 0.8, 40, '[{"item":"bear_pelt","weight":5,"min":1,"max":1},{"item":"raw_meat","weight":8,"min":2,"max":5}]'),
  -- Mountains T1
  ('mountain_goat',  'Mountain Goat',   (select id from b where name='mountains'), 1,  2,  12, 2,  0, 1.0,  8, '[{"item":"hide","weight":7,"min":1,"max":1},{"item":"raw_meat","weight":7,"min":1,"max":2}]'),
  ('rock_rat',       'Rock Rat',        (select id from b where name='mountains'), 1,  1,   8, 1,  0, 1.3,  5, '[{"item":"rodent_hide","weight":8,"min":1,"max":1}]'),
  -- Mountains T2
  ('mountain_troll', 'Mountain Troll',  (select id from b where name='mountains'), 2, 12,  90,16,  8, 0.7, 50, '[{"item":"troll_hide","weight":4,"min":1,"max":1},{"item":"iron_ore","weight":5,"min":1,"max":3}]'),
  -- Swamp T1
  ('swamp_frog',     'Giant Swamp Frog',(select id from b where name='swamp'),     1,  2,  10, 2,  0, 1.1,  6, '[{"item":"frog_leg","weight":8,"min":1,"max":2}]'),
  ('slime',          'Slime',           (select id from b where name='swamp'),     1,  1,  20, 1,  5, 0.6,  4, '[{"item":"slime_goo","weight":9,"min":1,"max":3}]'),
  -- Desert T1
  ('scorpion',       'Scorpion',        (select id from b where name='desert'),    1,  3,  14, 4,  2, 1.2,  9, '[{"item":"scorpion_claw","weight":6,"min":1,"max":1},{"item":"venom_sac","weight":3,"min":1,"max":1}]'),
  -- Ruins T1
  ('undead_shambler','Undead Shambler',  (select id from b where name='ruins'),    1,  3,  18, 5,  0, 0.7, 11, '[{"item":"bone","weight":8,"min":1,"max":3},{"item":"tattered_cloth","weight":5,"min":1,"max":1}]'),
  -- Volcanic T1
  ('fire_lizard',    'Fire Lizard',     (select id from b where name='volcanic'),  1,  4,  22, 6,  3, 1.1, 14, '[{"item":"fire_scale","weight":5,"min":1,"max":2},{"item":"sulfur","weight":7,"min":1,"max":2}]');
