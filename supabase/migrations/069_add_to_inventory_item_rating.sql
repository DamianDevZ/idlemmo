-- Migration 069: add p_item_rating to add_to_inventory so grade is stored
-- for both loot drops and crafted equipment. Previously the RPC silently
-- ignored item_rating causing all inventory items to have NULL grade.
CREATE OR REPLACE FUNCTION public.add_to_inventory(
  p_character_id uuid,
  p_item_name    text,
  p_quantity     int     DEFAULT 1,
  p_tier         int     DEFAULT 1,
  p_item_rating  text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id   uuid;
  v_stackable boolean;
BEGIN
  SELECT id, stackable
    INTO v_item_id, v_stackable
    FROM public.item_definitions
   WHERE name = p_item_name;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'add_to_inventory: item ''%'' not found in item_definitions', p_item_name;
  END IF;

  IF v_stackable THEN
    -- Stackable (materials, coins): stack quantity, grade not applicable
    INSERT INTO public.character_inventory (character_id, item_id, quantity, tier)
    VALUES (p_character_id, v_item_id, p_quantity, p_tier)
    ON CONFLICT (character_id, item_id, tier)
    DO UPDATE SET quantity = public.character_inventory.quantity + EXCLUDED.quantity;
  ELSE
    -- Non-stackable equipment: store item_rating (grade) on the inventory row
    INSERT INTO public.character_inventory (character_id, item_id, quantity, tier, item_rating)
    VALUES (p_character_id, v_item_id, 1, p_tier, p_item_rating)
    ON CONFLICT (character_id, item_id, tier)
    DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_to_inventory(uuid, text, int, int, text) TO authenticated;
