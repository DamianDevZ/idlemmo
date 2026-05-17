-- Add consumable_effects JSONB column to item_definitions.
-- Each effect is an object with a trigger type, target, value, and optional
-- duration/count/condition fields — fully extensible without schema changes.
--
-- Effect shape (TypeScript reference):
--   { trigger: 'instant'|'timed'|'tick'|'on_hit'
--     target: string               -- 'hp', 'str', 'fire_damage', etc.
--     value: number
--     duration_ticks?: number      -- timed only
--     tick_count?: number          -- tick only
--     hit_count?: number           -- on_hit only
--     condition?: 'exploring'      -- tick only: restrict to exploration phase
--   }

ALTER TABLE item_definitions
  ADD COLUMN IF NOT EXISTS consumable_effects jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN item_definitions.consumable_effects IS
  'Array of effect objects applied when this consumable is used. '
  'Each entry has: trigger (instant|timed|tick|on_hit), target, value, '
  'and optional duration_ticks / tick_count / hit_count / condition fields.';
