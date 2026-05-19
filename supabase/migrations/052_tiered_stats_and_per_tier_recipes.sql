-- Migration 052: tiered_stats + per-tier recipes
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. item_definitions.tiered_stats   — which stat keys scale with tier for this item
--    e.g. '{"base_damage"}' means only base_damage uses the global multiplier curve.
--    Empty array = no scaling (treat as T1 regardless of inventory tier).
--    NULL = use item type defaults (backward-compatible).
--
-- 2. enemies.tiered_stats            — same concept for enemies (base_hp, base_attack)
--
-- 3. recipes.output_tier             — per-tier recipe support
--    0  = applies to all tiers (non-tiered item, or catch-all)
--    1+ = specific tier recipe for a tiered item
--    Unique constraint changes from (output_item_id) → (output_item_id, output_tier)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. tiered_stats on item_definitions ──────────────────────────────────────
ALTER TABLE public.item_definitions
  ADD COLUMN IF NOT EXISTS tiered_stats text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.item_definitions.tiered_stats IS
  'Stat keys that participate in tier_scaling_config multipliers for this item. '
  'Empty = nothing scales. NULL treated as empty. '
  'Examples: {base_damage}, {base_defense}, {yield_min,yield_max}';

-- ── 2. tiered_stats on enemies ────────────────────────────────────────────────
ALTER TABLE public.enemies
  ADD COLUMN IF NOT EXISTS tiered_stats text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.enemies.tiered_stats IS
  'Stat keys that scale with area tier for this enemy. '
  'Typically {base_hp,base_attack}. Empty = enemy stats are fixed regardless of area tier.';

-- ── 3. Per-tier recipes ───────────────────────────────────────────────────────
-- Add output_tier: 0 = non-tiered / catch-all, 1-N = explicit tier recipe
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS output_tier int NOT NULL DEFAULT 0
    CHECK (output_tier >= 0 AND output_tier <= 20);

COMMENT ON COLUMN public.recipes.output_tier IS
  '0 = recipe applies to all tiers (non-tiered item). '
  '1-20 = recipe for this specific output tier of a tiered item.';

-- Drop old unique constraint (output_item_id alone) and replace with (output_item_id, output_tier)
ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_output_item_unique;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_output_item_tier_unique UNIQUE (output_item_id, output_tier);
