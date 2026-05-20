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
-- Old categories removed: gathering (→ tool_mastery), crafting (split), usage (split)

-- ─── 1. Add new categories ────────────────────────────────────────────────────
-- tool_mastery comes from renaming 'gathering' in step 5; do not insert it here.
INSERT INTO skill_categories (name, display_name, icon) VALUES
  ('weapon_mastery',  'Weapon Mastery',  '⚔️'),
  ('armor_mastery',   'Armor Mastery',   '🛡️'),
  ('weapon_crafting', 'Weapon Crafting', '🔨'),
  ('armor_crafting',  'Armor Crafting',  '🧵'),
  ('tool_crafting',   'Tool Crafting',   '🔧')
ON CONFLICT (name) DO NOTHING;

-- ─── 2. Wipe XP pools for categories being replaced ──────────────────────────
DELETE FROM character_category_points
WHERE category_id IN (
  SELECT id FROM skill_categories WHERE name IN ('gathering', 'crafting', 'usage')
);

-- ─── 3. Split usage skills → weapon_mastery / armor_mastery ──────────────────
UPDATE skills
SET category_id = (SELECT id FROM skill_categories WHERE name = 'weapon_mastery')
WHERE name IN ('axe_mastery','bow_mastery','hammer_mastery',
               'knife_mastery','staff_mastery','sword_mastery');

UPDATE skills
SET category_id = (SELECT id FROM skill_categories WHERE name = 'armor_mastery')
WHERE name IN ('leather_mastery','plate_mastery','robe_mastery');

-- ─── 4. Delete any leftover generic usage skills ──────────────────────────────
DELETE FROM character_skills
WHERE skill_id IN (
  SELECT id FROM skills
  WHERE category_id = (SELECT id FROM skill_categories WHERE name = 'usage')
    AND name NOT IN ('axe_mastery','bow_mastery','hammer_mastery','knife_mastery',
                     'staff_mastery','sword_mastery','leather_mastery','plate_mastery',
                     'robe_mastery','pickaxe_mastery','sickle_mastery')
);
DELETE FROM skills
WHERE category_id = (SELECT id FROM skill_categories WHERE name = 'usage')
  AND name NOT IN ('axe_mastery','bow_mastery','hammer_mastery','knife_mastery',
                   'staff_mastery','sword_mastery','leather_mastery','plate_mastery',
                   'robe_mastery','pickaxe_mastery','sickle_mastery');

-- ─── 5. Rename 'gathering' → 'tool_mastery' ──────────────────────────────────
UPDATE skill_categories
SET name = 'tool_mastery', display_name = 'Tool Mastery', icon = '⛏️'
WHERE name = 'gathering';

-- ─── 6. Move tool mastery skills → tool_mastery ──────────────────────────────
UPDATE skills
SET category_id = (SELECT id FROM skill_categories WHERE name = 'tool_mastery')
WHERE name IN ('pickaxe_mastery','sickle_mastery');

-- ─── 7. Delete old resource-type gathering skills ────────────────────────────
-- gathering_skill_id FK on item_definitions uses ON DELETE SET NULL — handled.
DELETE FROM character_skills
WHERE skill_id IN (
  SELECT id FROM skills
  WHERE name IN ('lumber_gathering','hide_gathering','ore_gathering',
                 'fiber_gathering','stone_gathering')
);
DELETE FROM skills
WHERE name IN ('lumber_gathering','hide_gathering','ore_gathering',
               'fiber_gathering','stone_gathering');

-- ─── 8. Delete now-empty 'usage' category ────────────────────────────────────
DELETE FROM skill_categories WHERE name = 'usage';

-- ─── 9. Split crafting skills → weapon_crafting / armor_crafting / tool_crafting
UPDATE skills
SET category_id = (SELECT id FROM skill_categories WHERE name = 'weapon_crafting')
WHERE name IN ('axe_crafting','bow_crafting','hammer_crafting',
               'knife_crafting','staff_crafting','sword_crafting');

UPDATE skills
SET category_id = (SELECT id FROM skill_categories WHERE name = 'armor_crafting')
WHERE name IN ('leather_crafting','plate_crafting','robe_crafting');

UPDATE skills
SET category_id = (SELECT id FROM skill_categories WHERE name = 'tool_crafting')
WHERE name IN ('pickaxe_crafting','sickle_crafting');

-- ─── 10. Delete now-empty 'crafting' category ────────────────────────────────
DELETE FROM skill_categories WHERE name = 'crafting';

