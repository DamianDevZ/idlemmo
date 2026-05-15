-- Migration 002: Skill Categories, Skills, Character Progress
-- Depends on: 001_characters

-- ─── Skill Categories ─────────────────────────────────────────────────────────
create table public.skill_categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,  -- gathering | refining | crafting | usage
  display_name text not null,
  icon         text not null default '⚙️'
);

-- ─── Skills (sub-skills within a category) ───────────────────────────────────
create table public.skills (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid not null references public.skill_categories(id),
  name              text not null unique,   -- snake_case identifier, e.g. wood_chopping
  display_name      text not null,
  description       text not null default '',
  primary_attribute text not null          -- which attribute primarily drives this skill
);

-- ─── Per-character skill levels ──────────────────────────────────────────────
create table public.character_skills (
  character_id          uuid not null references public.characters(id) on delete cascade,
  skill_id              uuid not null references public.skills(id),
  level                 int  not null default 0 check (level between 0 and 99),
  xp_toward_next_level  int  not null default 0 check (xp_toward_next_level >= 0),
  primary key (character_id, skill_id)
);

-- ─── Per-character category point pools ──────────────────────────────────────
-- category XP is earned by doing activities; it converts into spendable points
-- points_available = floor(xp_total / 100) - points_already_spent
create table public.character_category_points (
  character_id       uuid not null references public.characters(id) on delete cascade,
  category_id        uuid not null references public.skill_categories(id),
  xp_current         int  not null default 0 check (xp_current >= 0),
  points_available   int  not null default 0 check (points_available >= 0),
  points_total_earned int not null default 0 check (points_total_earned >= 0),
  primary key (character_id, category_id)
);

-- ─── Seed: Categories ─────────────────────────────────────────────────────────
insert into public.skill_categories (name, display_name, icon) values
  ('gathering', 'Gathering', '🪓'),
  ('refining',  'Refining',  '🔥'),
  ('crafting',  'Crafting',  '🔨'),
  ('usage',     'Usage',     '⚔️');

-- ─── Seed: Skills ─────────────────────────────────────────────────────────────
with cats as (
  select id, name from public.skill_categories
)
insert into public.skills (category_id, name, display_name, description, primary_attribute)
select c.id, s.name, s.display_name, s.description, s.primary_attribute
from cats c
join (values
  -- Gathering
  ('gathering', 'wood_chopping',  'Wood Chopping',  'Fell trees to gather logs. Strength increases yield; Dexterity increases speed.',       'dexterity'),
  ('gathering', 'stone_mining',   'Stone Mining',   'Extract stone from rocky outcrops. Strength is key.',                                    'strength'),
  ('gathering', 'ore_mining',     'Ore Mining',     'Mine metal ores. Intelligence helps identify richer veins.',                             'strength'),
  ('gathering', 'herb_gathering', 'Herb Gathering', 'Collect rare plants and fungi. Arcane improves find quality.',                           'arcane'),
  ('gathering', 'fishing',        'Fishing',        'Catch fish and aquatic creatures. Arcane determines what you catch.',                     'arcane'),
  ('gathering', 'hunting',        'Hunting',        'Track and kill wildlife. Dexterity for speed; Strength for clean kills.',                 'dexterity'),
  -- Refining
  ('refining',  'woodcutting',    'Woodcutting',    'Process raw logs into planks. Intelligence reduces material waste.',                      'intelligence'),
  ('refining',  'stonecutting',   'Stonecutting',   'Refine raw stone into usable blocks.',                                                    'intelligence'),
  ('refining',  'smelting',       'Smelting',       'Smelt ore into metal ingots. Intelligence improves efficiency.',                          'intelligence'),
  ('refining',  'cooking',        'Cooking',        'Prepare food from raw ingredients. Faith improves success.',                              'faith'),
  ('refining',  'tanning',        'Tanning',        'Convert hides into leather. Intelligence reduces waste.',                                 'intelligence'),
  -- Crafting
  ('crafting',  'carpentry',      'Carpentry',      'Craft bows, staves, and wooden furniture.',                                              'intelligence'),
  ('crafting',  'blacksmithing',  'Blacksmithing',  'Forge swords, axes, and metal armour.',                                                  'strength'),
  ('crafting',  'leatherworking', 'Leatherworking', 'Craft light armour and quivers from leather.',                                           'dexterity'),
  ('crafting',  'tailoring',      'Tailoring',      'Sew cloth armour and storage bags.',                                                     'intelligence'),
  -- Usage
  ('usage',     'one_handed',     'One-Handed',     'Proficiency with swords, axes, and maces in one hand.',                                  'strength'),
  ('usage',     'two_handed',     'Two-Handed',     'Proficiency with greatswords and greataxes.',                                            'strength'),
  ('usage',     'archery',        'Archery',        'Skill with bows and crossbows. Scales primarily with Dexterity.',                        'dexterity'),
  ('usage',     'magic',          'Magic',          'Casting spells and using staves. Intelligence is primary.',                              'intelligence'),
  ('usage',     'defense',        'Defense',        'Shield usage and damage mitigation. Reduces incoming damage further.',                    'endurance')
) as s(category_name, name, display_name, description, primary_attribute)
  on c.name = s.category_name;
