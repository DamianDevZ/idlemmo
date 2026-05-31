-- Migration 072: Fix tools to be tiered (is_tiered=true) and update recipe output_tier from 0 to 1.
--
-- All 5 tool items were incorrectly created with is_tiered=false and their recipes
-- at output_tier=0. Weapons use is_tiered=true with recipes at output_tier=1..N.
-- Tools should follow the same pattern so the admin recipe editor shows tier cards (T1..Tmax).

UPDATE public.item_definitions
SET is_tiered = true
WHERE name IN ('axe', 'pickaxe', 'hammer', 'sickle', 'knife')
  AND type = 'tool';

UPDATE public.recipes
SET output_tier = 1, tier = 1
WHERE output_item_id IN (
  SELECT id FROM public.item_definitions
  WHERE name IN ('axe', 'pickaxe', 'hammer', 'sickle', 'knife')
    AND type = 'tool'
)
AND output_tier = 0;
