-- Set base yield min=5 max=7 for all tools and configure decreasing tier scaling
-- multipliers from 1.0 (T1) down to 0.2 (T10) in even linear steps.
-- Step = (1.0 - 0.2) / 9 ≈ 0.0889 per tier.

-- 1. Update tool_config base yields and activate tiered stats
UPDATE item_definitions
SET
  tool_config = tool_config || '{"yield_min": 5, "yield_max": 7}'::jsonb,
  tiered_stats = ARRAY(
    SELECT DISTINCT unnest(tiered_stats || ARRAY['yield_min', 'yield_max'])
    ORDER BY 1
  )
WHERE type = 'tool';

-- 2. Replace tier_scaling_config multipliers for tool yield stats
--    Both yield_min and yield_max share the same multiplier curve.
UPDATE tier_scaling_config SET multiplier = 1.0000 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 1;
UPDATE tier_scaling_config SET multiplier = 0.9111 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 2;
UPDATE tier_scaling_config SET multiplier = 0.8222 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 3;
UPDATE tier_scaling_config SET multiplier = 0.7333 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 4;
UPDATE tier_scaling_config SET multiplier = 0.6444 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 5;
UPDATE tier_scaling_config SET multiplier = 0.5556 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 6;
UPDATE tier_scaling_config SET multiplier = 0.4667 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 7;
UPDATE tier_scaling_config SET multiplier = 0.3778 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 8;
UPDATE tier_scaling_config SET multiplier = 0.2889 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 9;
UPDATE tier_scaling_config SET multiplier = 0.2000 WHERE item_type = 'tool' AND stat_key IN ('yield_min','yield_max') AND tier = 10;
