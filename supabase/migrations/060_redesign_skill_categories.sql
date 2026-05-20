-- Migration 060: Redesign skill categories
--
-- New structure:
--   weapon_mastery  — earned from combat (50% of combat XP)
--   armor_mastery   — earned from combat (50% of combat XP)
--   tool_mastery    — earned from gathering (replaces 'gathering')
--   weapon_crafting — earned from crafting weapons
--   armor_crafting  — earned from crafting armor
--   tool_crafting   — earned from crafting tools
--   refining        — unchanged
--
-- Old categories removed: gathering, crafting, usage
-- Gathering skill nodes now replaced by per-tool-type mastery skills.
-- Usage (one_handed/two_handed/archery/magic/defense) replaced by
-- per-weapon-type mastery skills.

-- ─── 1. Add the new categories ────────────────────────────────────────────────
INSERT INTO skill_categories (name, display_name, icon) VALUES
  ('weapon_mastery',  'Weapon Mastery',  '⚔️'),
  ('armor_mastery',   'Armor Mastery',   '🛡️'),
  ('tool_mastery',    'Tool Mastery',    '⛏️'),
  ('weapon_crafting', 'Weapon Crafting', '🔨'),
  ('armor_crafting',  'Armor Crafting',  '🧵'),
  ('tool_crafting',   'Tool Crafting',   '🔧')
ON CONFLICT (name) DO NOTHING;

-- ─── 2. Clean up old character_category_points rows ───────────────────────────
-- These reference the old 'gathering', 'crafting', 'usage' categories.
-- Players re-earn XP under the new split categories.
DELETE FROM character_category_points
WHERE category_id IN (
  SELECT id FROM skill_categories WHERE name IN ('gathering', 'crafting', 'usage')
);

-- ─── 3. Remove old usage skills ───────────────────────────────────────────────
-- one_handed/two_handed/archery/magic/defense are replaced by
-- per-weapon-type mastery skills.
-- item_definitions.required_mastery_skill_id uses ON DELETE SET NULL — nulled automatically.
-- character_skills must be cleaned up first (FK to skills).
DELETE FROM character_skills
WHERE skill_id IN (
  SELECT id FROM skills
  WHERE name IN ('one_handed', 'two_handed', 'archery', 'magic', 'defense')
);
DELETE FROM skills
WHERE name IN ('one_handed', 'two_handed', 'archery', 'magic', 'defense');

-- ─── 4. Rename 'gathering' category → 'tool_mastery' ─────────────────────────
-- Reuse the existing category row so FK on character_category_points
-- (which we already cleared) doesn't matter.
UPDATE skill_categories
SET name = 'tool_mastery', display_name = 'Tool Mastery', icon = '⛏️'
WHERE name = 'gathering';

-- ─── 5. Remove old resource-type gathering skills ────────────────────────────
-- These were per-resource-type (lumber_gathering, ore_gathering, etc.).
-- They are replaced by per-tool-type mastery skills.
-- gathering_skill_id on item_definitions uses ON DELETE SET NULL — handled automatically.
DELETE FROM character_skills
WHERE skill_id IN (
  SELECT id FROM skills
  WHERE name IN ('lumber_gathering', 'hide_gathering', 'ore_gathering',
                 'fiber_gathering', 'stone_gathering')
);
DELETE FROM skills
WHERE name IN ('lumber_gathering', 'hide_gathering', 'ore_gathering',
               'fiber_gathering', 'stone_gathering');

-- ─── 6. Move weapon crafting skills into new weapon_crafting category ─────────
-- carpentry (bows/staves) and blacksmithing (swords/axes/hammers) are weapon crafting.
UPDATE skills
SET category_id = (SELECT id FROM skill_categories WHERE name = 'weapon_crafting')
WHERE name IN ('carpentry', 'blacksmithing');

-- ─── 7. Move armor crafting skills into new armor_crafting category ───────────
-- leatherworking and tailoring produce armor.
UPDATE skills
SET category_id = (SELECT id FROM skill_categories WHERE name = 'armor_crafting')
WHERE name IN ('leatherworking', 'tailoring');

-- ─── 8. Drop the now-empty 'crafting' and 'usage' categories ─────────────────
-- (no skills reference them any more after steps 3, 6, 7)
DELETE FROM skill_categories WHERE name IN ('crafting', 'usage');

-- ─── 9. Seed per-weapon-type mastery skills ───────────────────────────────────
-- ON CONFLICT handles the case where these already exist in the DB
-- (e.g. added manually) — it moves them to the right category.
INSERT INTO skills (category_id, name, display_name, description, primary_attribute)
SELECT c.id, s.name, s.display_name, s.description, s.primary_attribute
FROM (SELECT id FROM skill_categories WHERE name = 'weapon_mastery') c,
(VALUES
  ('axe_mastery',    'Axe Mastery',    'Mastery with axes. Unlocks higher tier axes.',         'strength'),
  ('bow_mastery',    'Bow Mastery',    'Mastery with bows. Unlocks higher tier bows.',          'dexterity'),
  ('hammer_mastery', 'Hammer Mastery', 'Mastery with hammers. Unlocks higher tier hammers.',    'strength'),
  ('knife_mastery',  'Knife Mastery',  'Mastery with knives. Unlocks higher tier knives.',      'dexterity'),
  ('staff_mastery',  'Staff Mastery',  'Mastery with staves. Unlocks higher tier staves.',      'intelligence'),
  ('sword_mastery',  'Sword Mastery',  'Mastery with swords. Unlocks higher tier swords.',      'strength')
) AS s(name, display_name, description, primary_attribute)
ON CONFLICT (name) DO UPDATE SET
  category_id  = EXCLUDED.category_id,
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description;

-- ─── 10. Seed per-armor-type mastery skills ───────────────────────────────────
INSERT INTO skills (category_id, name, display_name, description, primary_attribute)
SELECT c.id, s.name, s.display_name, s.description, s.primary_attribute
FROM (SELECT id FROM skill_categories WHERE name = 'armor_mastery') c,
(VALUES
  ('leather_mastery', 'Leather Mastery', 'Mastery with leather armor. Unlocks higher tier leather.', 'dexterity'),
  ('plate_mastery',   'Plate Mastery',   'Mastery with plate armor. Unlocks higher tier plate.',     'strength'),
  ('robe_mastery',    'Robe Mastery',    'Mastery with robes. Unlocks higher tier robes.',           'intelligence')
) AS s(name, display_name, description, primary_attribute)
ON CONFLICT (name) DO UPDATE SET
  category_id  = EXCLUDED.category_id,
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description;

-- ─── 11. Seed per-tool-type mastery skills ────────────────────────────────────
INSERT INTO skills (category_id, name, display_name, description, primary_attribute)
SELECT c.id, s.name, s.display_name, s.description, s.primary_attribute
FROM (SELECT id FROM skill_categories WHERE name = 'tool_mastery') c,
(VALUES
  ('pickaxe_mastery', 'Pickaxe Mastery', 'Mastery with pickaxes. Unlocks higher tier pickaxes.', 'strength'),
  ('sickle_mastery',  'Sickle Mastery',  'Mastery with sickles. Unlocks higher tier sickles.',   'dexterity')
) AS s(name, display_name, description, primary_attribute)
ON CONFLICT (name) DO UPDATE SET
  category_id  = EXCLUDED.category_id,
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description;
