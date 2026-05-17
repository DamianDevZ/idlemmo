-- Add is_tiered flag to item_definitions so items can be marked as existing
-- across multiple tiers (T1–Tmax) vs. being a single, non-tiered item.
ALTER TABLE item_definitions ADD COLUMN is_tiered boolean NOT NULL DEFAULT true;

-- Existing items with no equipment_tier set were never tiered (e.g. consumables,
-- non-tiered materials). Back-fill them as not tiered.
UPDATE item_definitions SET is_tiered = false WHERE equipment_tier IS NULL;

-- Add max_tier to game_config so admins can adjust the global tier cap without
-- a code deploy. Stored under the 'items' category.
INSERT INTO game_config (category, sort_order, key, label, description, value, default_value, min_value, max_value, step)
VALUES ('items', 1, 'max_tier', 'Max Item Tier', 'Global maximum number of tiers for tiered items (weapons, armor, tools, materials).', 5, 5, 1, 20, 1);
