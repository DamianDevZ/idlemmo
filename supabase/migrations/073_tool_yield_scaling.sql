-- Set base yield min=max=5 for all tools and configure decreasing tier scaling
-- so T10 tools yield exactly 0.2 items/attempt at their native tier.
-- Linear interpolation: step = (1.0 - 0.04) / 9 ≈ 0.1067 per tier.

-- 1. Update tool_config base yields and activate tiered stats
UPDATE item_definitions
SET
  tool_config = tool_config || '{"yield_min": 5, "yield_max": 5}'::jsonb,
  tiered_stats = ARRAY(
    SELECT DISTINCT unnest(tiered_stats || ARRAY['yield_min', 'yield_max'])
    ORDER BY 1
  )
WHERE type = 'tool';

-- 2. Replace tier_scaling_config multipliers for tool yield stats
--    Both yield_min and yield_max share the same curve since base values are equal.
UPDATE tier_scaling_config SET multiplier = 1.0000 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 1;
UPDATE tier_scaling_config SET multiplier = 0.8933 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 2;
UPDATE tier_scaling_config SET multiplier = 0.7867 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 3;
UPDATE tier_scaling_config SET multiplier = 0.6800 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 4;
UPDATE tier_scaling_config SET multiplier = 0.5733 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 5;
UPDATE tier_scaling_config SET multiplier = 0.4667 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 6;
UPDATE tier_scaling_config SET multiplier = 0.3600 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 7;
UPDATE tier_scaling_config SET multiplier = 0.2533 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 8;
UPDATE tier_scaling_config SET multiplier = 0.1467 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 9;
UPDATE tier_scaling_config SET multiplier = 0.0400 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 10;
