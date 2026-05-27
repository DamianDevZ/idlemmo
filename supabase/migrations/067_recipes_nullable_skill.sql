-- Migration 067: Make required_skill_id nullable on recipes
-- ─────────────────────────────────────────────────────────────────────────────
-- Crafting recipes (weapon, armor, tool) do not require a skill — their category
-- is derived from the output item's type. Only refining recipes need a skill to
-- determine which resource group they appear under in the refining UI.
--
-- The NOT NULL constraint was leftover from the original single-skill-per-recipe
-- design and is no longer correct.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.recipes
  ALTER COLUMN required_skill_id DROP NOT NULL;

COMMENT ON COLUMN public.recipes.required_skill_id IS
  'NULL for crafting recipes (category derived from output item type). '
  'Set to a skill id for refining recipes to determine which resource group they belong to.';
