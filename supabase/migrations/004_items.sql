-- Migration 004: Items, Equipment, Inventory, Stash, Recipes
-- Depends on: 001_characters, 002_skills

-- ─── Item Definitions ─────────────────────────────────────────────────────────
create table public.item_definitions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,   -- snake_case identifier used in loot tables
  display_name text not null,
  type         text not null check (type in ('material','tool','weapon','armor','consumable','misc')),
  rarity       text not null check (rarity in ('common','uncommon','rare','epic','legendary')),
  description  text not null default '',
  -- Flexible stats blob. Keys used by formulas:
  --   weapon_damage, weapon_speed, weapon_crit, armor_rating, vigor_bonus,
  --   tool_tier, tool_speed_mult, tool_yield_mult,
  --   req_strength, req_dexterity, req_intelligence,
  --   required_skill_level
  stats        jsonb not null default '{}',
  tool_tier    int,          -- null = not a tool; 1–5 = tool tier
  stackable    boolean not null default true,
  image_url    text
);

-- ─── Character Inventory (what you carry into the field) ─────────────────────
create table public.character_inventory (
  character_id  uuid not null references public.characters(id) on delete cascade,
  item_id       uuid not null references public.item_definitions(id),
  quantity      int  not null default 1 check (quantity > 0),
  equipped_slot text check (equipped_slot in
    ('weapon','offhand','head','chest','legs','hands','feet','ring','amulet')),
  primary key (character_id, item_id)
);

-- ─── Character Stash (safe storage at home base) ──────────────────────────────
create table public.character_stash (
  character_id  uuid not null references public.characters(id) on delete cascade,
  item_id       uuid not null references public.item_definitions(id),
  quantity      int  not null default 1 check (quantity > 0),
  primary key (character_id, item_id)
);

-- ─── Recipes ─────────────────────────────────────────────────────────────────
create table public.recipes (
  id                    uuid primary key default gen_random_uuid(),
  display_name          text not null,
  output_item_id        uuid not null references public.item_definitions(id),
  output_quantity       int  not null default 1 check (output_quantity > 0),
  required_skill_id     uuid not null references public.skills(id),
  required_skill_level  int  not null default 1,
  -- JSON array: [{ "item_name": "pine_log", "quantity": 5 }]
  ingredients           jsonb not null default '[]',
  base_success_chance   int  not null default 80 check (base_success_chance between 1 and 95),
  craft_time_seconds    int  not null default 10 check (craft_time_seconds > 0)
);

-- ─── Seed: Items ─────────────────────────────────────────────────────────────
-- Materials
insert into public.item_definitions (name, display_name, type, rarity, description, stats, stackable) values
  -- Raw gathered
  ('pine_log',          'Pine Log',           'material', 'common',   'Soft timber from young pine trees.',                      '{}',                                   true),
  ('oak_log',           'Oak Log',            'material', 'common',   'Dense timber from a mature oak.',                         '{}',                                   true),
  ('hardwood_log',      'Hardwood Log',       'material', 'uncommon', 'Exceptionally sturdy timber.',                            '{}',                                   true),
  ('crystalwood_log',   'Crystalwood Log',    'material', 'rare',     'Wood infused with crystalline energy.',                   '{}',                                   true),
  ('spirit_wood',       'Spirit Wood',        'material', 'epic',     'Wood from a tree touched by the spirit realm.',           '{}',                                   true),
  ('copper_ore',        'Copper Ore',         'material', 'common',   'Basic ore found near the surface.',                       '{}',                                   true),
  ('iron_ore',          'Iron Ore',           'material', 'common',   'Common ore used in most equipment.',                      '{}',                                   true),
  ('mithril_ore',       'Mithril Ore',        'material', 'rare',     'Lightweight ore with exceptional strength.',               '{}',                                   true),
  ('herb_common',       'Wild Herb',          'material', 'common',   'A common herb with mild healing properties.',             '{}',                                   true),
  ('herb_rare',         'Moonpetal',          'material', 'rare',     'A rare herb that blooms only at night.',                  '{}',                                   true),
  ('raw_fish',          'Raw Fish',           'material', 'common',   'A freshly caught fish.',                                  '{}',                                   true),
  ('raw_meat',          'Raw Meat',           'material', 'common',   'Meat from a hunted animal.',                              '{}',                                   true),
  ('wolf_pelt',         'Wolf Pelt',          'material', 'common',   'Pelt from a wolf.',                                       '{}',                                   true),
  ('bear_pelt',         'Bear Pelt',          'material', 'uncommon', 'Thick pelt from a brown bear.',                           '{}',                                   true),
  ('hide',              'Animal Hide',        'material', 'common',   'Generic hide from a small animal.',                       '{}',                                   true),
  ('troll_hide',        'Troll Hide',         'material', 'uncommon', 'Tough hide from a mountain troll.',                       '{}',                                   true),
  ('bone',              'Bone',               'material', 'common',   'A brittle bone.',                                         '{}',                                   true),
  ('frog_leg',          'Frog Leg',           'material', 'common',   'Surprisingly nutritious.',                                '{}',                                   true),
  ('slime_goo',         'Slime Goo',          'material', 'common',   'Sticky and useful for adhesives.',                        '{}',                                   true),
  ('scorpion_claw',     'Scorpion Claw',      'material', 'common',   'Sharp and durable.',                                      '{}',                                   true),
  ('venom_sac',         'Venom Sac',          'material', 'uncommon', 'Contains potent venom.',                                  '{}',                                   true),
  ('fire_scale',        'Fire Scale',         'material', 'uncommon', 'A scale from a fire lizard, still warm.',                 '{}',                                   true),
  ('sulfur',            'Sulfur',             'material', 'common',   'Powdery mineral with a pungent smell.',                   '{}',                                   true),
  ('tattered_cloth',    'Tattered Cloth',     'material', 'common',   'Worn fabric.',                                            '{}',                                   true),
  ('rodent_hide',       'Rodent Hide',        'material', 'common',   'Thin hide from a small creature.',                        '{}',                                   true),
  ('copper_coin',       'Copper Coin',        'misc',     'common',   'Currency.',                                               '{}',                                   true),
  -- Refined
  ('pine_plank',        'Pine Plank',         'material', 'common',   'Processed pine timber.',                                  '{}',                                   true),
  ('oak_plank',         'Oak Plank',          'material', 'common',   'Processed oak timber.',                                   '{}',                                   true),
  ('copper_ingot',      'Copper Ingot',       'material', 'common',   'Smelted copper.',                                         '{}',                                   true),
  ('iron_ingot',        'Iron Ingot',         'material', 'common',   'Smelted iron.',                                           '{}',                                   true),
  ('mithril_ingot',     'Mithril Ingot',      'material', 'rare',     'Smelted mithril.',                                        '{}',                                   true),
  ('leather',           'Leather',            'material', 'common',   'Tanned leather.',                                         '{}',                                   true),
  ('cooked_meat',       'Cooked Meat',        'consumable','common',  'Restores a small amount of HP.', '{"hp_restore":20}',                                              true),
  ('cooked_fish',       'Cooked Fish',        'consumable','common',  'Restores HP and grants a small speed buff.', '{"hp_restore":15,"dex_temp_bonus":1}',               true),
  -- Crude knife (enemy drop, also lowest crafted weapon)
  ('crude_knife',       'Crude Knife',        'weapon',   'common',   'A roughly sharpened knife.',  '{"weapon_damage":4,"weapon_speed":1.5,"weapon_crit":0,"req_strength":0}', false),
  ('iron_dagger',       'Iron Dagger',        'weapon',   'common',   'A sharp iron dagger.',        '{"weapon_damage":8,"weapon_speed":1.8,"weapon_crit":3,"req_strength":5}', false),
  -- Starter tools (Tier 1)
  ('stone_axe',         'Stone Axe',          'tool',     'common',   'A crude stone axe. Tier 1.',  '{"tool_tier":1,"tool_speed_mult":1.0,"tool_yield_mult":1.0}',        false),
  ('stone_pickaxe',     'Stone Pickaxe',      'tool',     'common',   'A crude stone pickaxe. Tier 1.','{"tool_tier":1,"tool_speed_mult":1.0,"tool_yield_mult":1.0}',      false),
  -- Tier 2 tools
  ('iron_axe',          'Iron Axe',           'tool',     'common',   'A solid iron axe. Tier 2.',   '{"tool_tier":2,"tool_speed_mult":1.2,"tool_yield_mult":1.15,"req_strength":8}', false),
  ('iron_pickaxe',      'Iron Pickaxe',       'tool',     'common',   'A solid iron pickaxe. Tier 2.','{"tool_tier":2,"tool_speed_mult":1.2,"tool_yield_mult":1.15,"req_strength":8}', false),
  -- Tier 3 tools
  ('steel_axe',         'Steel Axe',          'tool',     'uncommon', 'High-quality steel axe. Tier 3.','{"tool_tier":3,"tool_speed_mult":1.5,"tool_yield_mult":1.3,"req_strength":15}', false),
  ('steel_pickaxe',     'Steel Pickaxe',      'tool',     'uncommon', 'High-quality steel pickaxe. Tier 3.','{"tool_tier":3,"tool_speed_mult":1.5,"tool_yield_mult":1.3,"req_strength":15}', false),
  -- Fishing rod
  ('basic_fishing_rod', 'Fishing Rod',        'tool',     'common',   'A simple fishing rod. Tier 1.','{"tool_tier":1,"tool_speed_mult":1.0,"tool_yield_mult":1.0}',       false),
  -- Starter armour
  ('hide_vest',         'Hide Vest',          'armor',    'common',   'Basic chest armour.', '{"armor_rating":8,"req_strength":0}',                                        false),
  ('hide_leggings',     'Hide Leggings',      'armor',    'common',   'Basic leg armour.',   '{"armor_rating":5,"req_strength":0}',                                        false);
