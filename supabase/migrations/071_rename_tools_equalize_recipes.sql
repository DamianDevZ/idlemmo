-- Migration 071: Drop "Copper" prefix from T1 tools and standardize recipe costs.
-- All five tools now cost the same: 4× Plank + 4× Metal Bars.

DO $$
DECLARE
  v_plank_id uuid;
  v_metal_id uuid;
BEGIN
  SELECT id INTO v_plank_id FROM public.item_definitions WHERE name = 'plank';
  SELECT id INTO v_metal_id FROM public.item_definitions WHERE name = 'metal_bars';

  -- ── Rename tool items ────────────────────────────────────────────────────
  UPDATE public.item_definitions SET name = 'axe',     display_name = 'Axe'     WHERE name = 'copper_axe';
  UPDATE public.item_definitions SET name = 'pickaxe', display_name = 'Pickaxe' WHERE name = 'copper_pickaxe';
  UPDATE public.item_definitions SET name = 'hammer',  display_name = 'Hammer'  WHERE name = 'copper_hammer';
  UPDATE public.item_definitions SET name = 'sickle',  display_name = 'Sickle'  WHERE name = 'copper_sickle';
  UPDATE public.item_definitions SET name = 'knife',   display_name = 'Knife'   WHERE name = 'copper_knife';

  -- ── Rename recipe scrolls ────────────────────────────────────────────────
  UPDATE public.item_definitions SET name = 'axe_scroll',     display_name = 'Axe Scroll'     WHERE name = 'copper_axe_scroll';
  UPDATE public.item_definitions SET name = 'pickaxe_scroll', display_name = 'Pickaxe Scroll' WHERE name = 'copper_pickaxe_scroll';
  UPDATE public.item_definitions SET name = 'hammer_scroll',  display_name = 'Hammer Scroll'  WHERE name = 'copper_hammer_scroll';
  UPDATE public.item_definitions SET name = 'sickle_scroll',  display_name = 'Sickle Scroll'  WHERE name = 'copper_sickle_scroll';
  UPDATE public.item_definitions SET name = 'knife_scroll',   display_name = 'Knife Scroll'   WHERE name = 'copper_knife_scroll';

  -- ── Update recipe display names ──────────────────────────────────────────
  UPDATE public.recipes SET display_name = 'Axe'     WHERE display_name = 'Copper Axe';
  UPDATE public.recipes SET display_name = 'Pickaxe' WHERE display_name = 'Copper Pickaxe';
  UPDATE public.recipes SET display_name = 'Hammer'  WHERE display_name = 'Copper Hammer';
  UPDATE public.recipes SET display_name = 'Sickle'  WHERE display_name = 'Copper Sickle';
  UPDATE public.recipes SET display_name = 'Knife'   WHERE display_name = 'Copper Knife';

  -- ── Standardize all tool recipes: 4× Plank + 4× Metal Bars ─────────────
  UPDATE public.recipes
  SET ingredients = jsonb_build_array(
    jsonb_build_object('item_id', v_plank_id, 'quantity', 4, 'tier', NULL),
    jsonb_build_object('item_id', v_metal_id, 'quantity', 4, 'tier', NULL)
  )
  WHERE output_item_id IN (
    SELECT id FROM public.item_definitions
    WHERE name IN ('axe', 'pickaxe', 'hammer', 'sickle', 'knife')
  );
END;
$$;
