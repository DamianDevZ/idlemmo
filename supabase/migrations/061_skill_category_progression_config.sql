-- Migration 061: Add per-category progression config to skill_categories
-- Allows each category to have its own action XP rate and tier cost curve
-- instead of sharing global formula constants.

ALTER TABLE skill_categories
  ADD COLUMN IF NOT EXISTS tier_xp_base       NUMERIC(10,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS tier_xp_scaling    NUMERIC(10,4) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS action_xp_per_unit NUMERIC(10,4) NOT NULL DEFAULT 1;

-- weapon_mastery / armor_mastery: fraction of main combat XP earned in the same tick (0.5 = 50%)
UPDATE skill_categories SET action_xp_per_unit = 0.5,  tier_xp_base = 100, tier_xp_scaling = 1.5 WHERE name = 'weapon_mastery';
UPDATE skill_categories SET action_xp_per_unit = 0.5,  tier_xp_base = 100, tier_xp_scaling = 1.5 WHERE name = 'armor_mastery';
-- tool_mastery: XP awarded per resource item collected
UPDATE skill_categories SET action_xp_per_unit = 2,    tier_xp_base = 100, tier_xp_scaling = 1.5 WHERE name = 'tool_mastery';
-- crafting categories: XP awarded per recipe tier
UPDATE skill_categories SET action_xp_per_unit = 20,   tier_xp_base = 100, tier_xp_scaling = 1.5 WHERE name = 'weapon_crafting';
UPDATE skill_categories SET action_xp_per_unit = 20,   tier_xp_base = 100, tier_xp_scaling = 1.5 WHERE name = 'armor_crafting';
UPDATE skill_categories SET action_xp_per_unit = 20,   tier_xp_base = 100, tier_xp_scaling = 1.5 WHERE name = 'tool_crafting';
-- refining: XP awarded per resource tier processed
UPDATE skill_categories SET action_xp_per_unit = 15,   tier_xp_base = 100, tier_xp_scaling = 1.5 WHERE name = 'refining';
