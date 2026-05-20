-- Migration 062: Separate scaling factor for earned XP per action
-- Previously, earned XP and tier cost shared one scaling value (tier_xp_scaling).
-- This adds a dedicated action_xp_scaling column so each curve can be tuned independently.

ALTER TABLE skill_categories
  ADD COLUMN IF NOT EXISTS action_xp_scaling NUMERIC(10,4) NOT NULL DEFAULT 1.5;

-- Default: same as tier_xp_scaling so existing behaviour is unchanged
UPDATE skill_categories SET action_xp_scaling = 1.5;
