-- Stores gathering tool stats as a single JSONB object.
--
-- Shape:
--   yield_min           int     -- minimum items gathered per attempt at own tier
--   yield_max           int     -- maximum items gathered per attempt at own tier
--   above_penalty       number  -- % reduction when gathering one tier above (floor+frac system)
--   below_bonus_base    number  -- % bonus for gathering one tier below own tier
--   below_bonus_growth  number  -- compound growth % applied each additional tier step below
--                                  bonus(n) = below_bonus_base * (1 + below_bonus_growth/100)^(n-1)

ALTER TABLE item_definitions
  ADD COLUMN IF NOT EXISTS tool_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN item_definitions.tool_config IS
  'Gathering yield configuration for tool items. '
  'Fields: yield_min, yield_max, above_penalty, below_bonus_base, below_bonus_growth.';
