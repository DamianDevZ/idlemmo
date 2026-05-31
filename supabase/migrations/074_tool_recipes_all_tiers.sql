-- Create T2–T10 recipes for all 5 tools using match-to-tier logic.
-- Ingredient tier matches the output tier (same as clicking "Match to tier" in the admin UI).
-- T1 recipes already exist (from migration 070). This adds T2–T10.

INSERT INTO recipes (display_name, output_item_id, output_quantity, required_skill_id,
                     required_skill_level, craft_time_seconds, tier, category, output_tier, ingredients)
SELECT
  r.display_name,
  r.output_item_id,
  r.output_quantity,
  r.required_skill_id,
  r.required_skill_level,
  r.craft_time_seconds,
  t.tier_num               AS tier,
  r.category,
  t.tier_num               AS output_tier,
  -- set each ingredient's tier to match the output tier
  (
    SELECT jsonb_agg(ing || jsonb_build_object('tier', t.tier_num))
    FROM jsonb_array_elements(r.ingredients) AS ing
  )                        AS ingredients
FROM recipes r
CROSS JOIN generate_series(2, 10) AS t(tier_num)
WHERE r.output_tier = 1
  AND r.output_item_id IN (
    SELECT id FROM item_definitions WHERE type = 'tool'
  )
ON CONFLICT DO NOTHING;
