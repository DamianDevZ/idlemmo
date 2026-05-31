-- Migration 070: Seed five T1 copper tools (one per tool slot) with recipes and scrolls.
--
-- Slots covered:
--   tool_axe      → Copper Axe
--   tool_pickaxe  → Copper Pickaxe
--   tool_hammer   → Copper Hammer
--   tool_sickle   → Copper Sickle
--   tool_knife    → Copper Knife
--
-- Each tool gets:
--   • An item_definitions row (type='tool', T1, is_tiered=false)
--   • A recipes row with pine_plank + copper_ingot ingredients
--   • A recipe scroll item (type='recipe') so players can unlock crafting

DO $$
DECLARE
  -- Ingredient IDs (must already exist from migration 004)
  v_plank_id        uuid;
  v_ingot_id        uuid;

  -- Tool IDs (populated after each INSERT ... RETURNING)
  v_axe_id          uuid;
  v_pick_id         uuid;
  v_hammer_id       uuid;
  v_sickle_id       uuid;
  v_knife_id        uuid;

  -- Shared tool_config for all T1 copper tools
  v_tool_config     jsonb := '{"yield_min":1,"yield_max":3,"above_penalty":100,"below_bonus_base":100,"below_bonus_growth":50}';
BEGIN
  -- ── Resolve ingredient UUIDs ──────────────────────────────────────────────
  SELECT id INTO v_plank_id FROM public.item_definitions WHERE name = 'plank';
  SELECT id INTO v_ingot_id FROM public.item_definitions WHERE name = 'metal_bars';

  IF v_plank_id IS NULL THEN
    RAISE EXCEPTION 'Migration 070: plank not found in item_definitions';
  END IF;
  IF v_ingot_id IS NULL THEN
    RAISE EXCEPTION 'Migration 070: metal_bars not found in item_definitions';
  END IF;

  -- ── 1. Copper Axe ─────────────────────────────────────────────────────────
  INSERT INTO public.item_definitions
    (name, display_name, type, description, stackable, equipment_tier, is_tiered, tool_slot, tool_config)
  VALUES
    ('copper_axe', 'Copper Axe', 'tool',
     'A copper-headed axe for chopping wood. Basic Tier 1 tool.',
     false, 1, false, 'tool_axe', v_tool_config)
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO v_axe_id;

  IF v_axe_id IS NOT NULL THEN
    INSERT INTO public.recipes
      (display_name, output_item_id, output_quantity, required_skill_id, required_skill_level,
       ingredients, craft_time_seconds, category, tier, output_tier)
    VALUES
      ('Copper Axe', v_axe_id, 1, NULL, 1,
       jsonb_build_array(
         jsonb_build_object('item_id', v_plank_id, 'quantity', 5, 'tier', NULL),
         jsonb_build_object('item_id', v_ingot_id, 'quantity', 3, 'tier', NULL)
       ),
       30, 'tool', 1, 0);

    INSERT INTO public.item_definitions
      (name, display_name, type, description, stackable, is_tiered, recipe_for_item_id)
    VALUES
      ('copper_axe_scroll', 'Copper Axe Scroll', 'recipe',
       'Recipe scroll for crafting a Copper Axe.',
       true, false, v_axe_id);
  END IF;

  -- ── 2. Copper Pickaxe ─────────────────────────────────────────────────────
  INSERT INTO public.item_definitions
    (name, display_name, type, description, stackable, equipment_tier, is_tiered, tool_slot, tool_config)
  VALUES
    ('copper_pickaxe', 'Copper Pickaxe', 'tool',
     'A copper pickaxe for mining ore and stone. Basic Tier 1 tool.',
     false, 1, false, 'tool_pickaxe', v_tool_config)
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO v_pick_id;

  IF v_pick_id IS NOT NULL THEN
    INSERT INTO public.recipes
      (display_name, output_item_id, output_quantity, required_skill_id, required_skill_level,
       ingredients, craft_time_seconds, category, tier, output_tier)
    VALUES
      ('Copper Pickaxe', v_pick_id, 1, NULL, 1,
       jsonb_build_array(
         jsonb_build_object('item_id', v_plank_id, 'quantity', 4, 'tier', NULL),
         jsonb_build_object('item_id', v_ingot_id, 'quantity', 4, 'tier', NULL)
       ),
       30, 'tool', 1, 0);

    INSERT INTO public.item_definitions
      (name, display_name, type, description, stackable, is_tiered, recipe_for_item_id)
    VALUES
      ('copper_pickaxe_scroll', 'Copper Pickaxe Scroll', 'recipe',
       'Recipe scroll for crafting a Copper Pickaxe.',
       true, false, v_pick_id);
  END IF;

  -- ── 3. Copper Hammer ──────────────────────────────────────────────────────
  INSERT INTO public.item_definitions
    (name, display_name, type, description, stackable, equipment_tier, is_tiered, tool_slot, tool_config)
  VALUES
    ('copper_hammer', 'Copper Hammer', 'tool',
     'A sturdy copper hammer for smithing and crafting. Basic Tier 1 tool.',
     false, 1, false, 'tool_hammer', v_tool_config)
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO v_hammer_id;

  IF v_hammer_id IS NOT NULL THEN
    INSERT INTO public.recipes
      (display_name, output_item_id, output_quantity, required_skill_id, required_skill_level,
       ingredients, craft_time_seconds, category, tier, output_tier)
    VALUES
      ('Copper Hammer', v_hammer_id, 1, NULL, 1,
       jsonb_build_array(
         jsonb_build_object('item_id', v_plank_id, 'quantity', 3, 'tier', NULL),
         jsonb_build_object('item_id', v_ingot_id, 'quantity', 5, 'tier', NULL)
       ),
       30, 'tool', 1, 0);

    INSERT INTO public.item_definitions
      (name, display_name, type, description, stackable, is_tiered, recipe_for_item_id)
    VALUES
      ('copper_hammer_scroll', 'Copper Hammer Scroll', 'recipe',
       'Recipe scroll for crafting a Copper Hammer.',
       true, false, v_hammer_id);
  END IF;

  -- ── 4. Copper Sickle ──────────────────────────────────────────────────────
  INSERT INTO public.item_definitions
    (name, display_name, type, description, stackable, equipment_tier, is_tiered, tool_slot, tool_config)
  VALUES
    ('copper_sickle', 'Copper Sickle', 'tool',
     'A curved copper blade for harvesting plants and fibre. Basic Tier 1 tool.',
     false, 1, false, 'tool_sickle', v_tool_config)
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO v_sickle_id;

  IF v_sickle_id IS NOT NULL THEN
    INSERT INTO public.recipes
      (display_name, output_item_id, output_quantity, required_skill_id, required_skill_level,
       ingredients, craft_time_seconds, category, tier, output_tier)
    VALUES
      ('Copper Sickle', v_sickle_id, 1, NULL, 1,
       jsonb_build_array(
         jsonb_build_object('item_id', v_plank_id, 'quantity', 3, 'tier', NULL),
         jsonb_build_object('item_id', v_ingot_id, 'quantity', 2, 'tier', NULL)
       ),
       30, 'tool', 1, 0);

    INSERT INTO public.item_definitions
      (name, display_name, type, description, stackable, is_tiered, recipe_for_item_id)
    VALUES
      ('copper_sickle_scroll', 'Copper Sickle Scroll', 'recipe',
       'Recipe scroll for crafting a Copper Sickle.',
       true, false, v_sickle_id);
  END IF;

  -- ── 5. Copper Knife ───────────────────────────────────────────────────────
  INSERT INTO public.item_definitions
    (name, display_name, type, description, stackable, equipment_tier, is_tiered, tool_slot, tool_config)
  VALUES
    ('copper_knife', 'Copper Knife', 'tool',
     'A sharp copper knife for hunting and skinning. Basic Tier 1 tool.',
     false, 1, false, 'tool_knife', v_tool_config)
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO v_knife_id;

  IF v_knife_id IS NOT NULL THEN
    INSERT INTO public.recipes
      (display_name, output_item_id, output_quantity, required_skill_id, required_skill_level,
       ingredients, craft_time_seconds, category, tier, output_tier)
    VALUES
      ('Copper Knife', v_knife_id, 1, NULL, 1,
       jsonb_build_array(
         jsonb_build_object('item_id', v_plank_id, 'quantity', 2, 'tier', NULL),
         jsonb_build_object('item_id', v_ingot_id, 'quantity', 2, 'tier', NULL)
       ),
       30, 'tool', 1, 0);

    INSERT INTO public.item_definitions
      (name, display_name, type, description, stackable, is_tiered, recipe_for_item_id)
    VALUES
      ('copper_knife_scroll', 'Copper Knife Scroll', 'recipe',
       'Recipe scroll for crafting a Copper Knife.',
       true, false, v_knife_id);
  END IF;

END;
$$;
