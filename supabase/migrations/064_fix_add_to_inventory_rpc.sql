-- Migration 064: Fix add_to_inventory RPC for current schema
-- ─────────────────────────────────────────────────────────────────────────────
-- The original RPC predates migration 039 which changed character_inventory's
-- PK from (character_id, item_id) → (character_id, item_id, tier).
-- Any ON CONFLICT clause targeting only (character_id, item_id) is now invalid,
-- silently returning success without writing any rows.
--
-- This migration replaces the function with a version that:
--   • Uses the correct conflict target (character_id, item_id, tier)
--   • Increments quantity for stackable items (materials, coins, consumables)
--   • Inserts a fresh slot for non-stackable equipment (DO NOTHING on duplicate)
--   • Accepts an optional p_tier argument (defaults to 1 for stackable materials)

CREATE OR REPLACE FUNCTION public.add_to_inventory(
  p_character_id uuid,
  p_item_name    text,
  p_quantity     int  DEFAULT 1,
  p_tier         int  DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id   uuid;
  v_stackable boolean;
BEGIN
  -- Resolve item name to id and stackability flag
  SELECT id, stackable
    INTO v_item_id, v_stackable
    FROM public.item_definitions
   WHERE name = p_item_name;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'add_to_inventory: item ''%'' not found in item_definitions', p_item_name;
  END IF;

  IF v_stackable THEN
    -- Stackable materials/coins: increment the existing stack or create it.
    -- ON CONFLICT matches the current PK: (character_id, item_id, tier).
    INSERT INTO public.character_inventory (character_id, item_id, quantity, tier)
    VALUES (p_character_id, v_item_id, p_quantity, p_tier)
    ON CONFLICT (character_id, item_id, tier)
    DO UPDATE SET quantity = public.character_inventory.quantity + EXCLUDED.quantity;
  ELSE
    -- Non-stackable equipment: one row per (character, item, tier).
    -- If the player already has a slot at this tier, do nothing — the caller
    -- should handle the duplicate case (e.g. offer to stash or sell).
    INSERT INTO public.character_inventory (character_id, item_id, quantity, tier)
    VALUES (p_character_id, v_item_id, 1, p_tier)
    ON CONFLICT (character_id, item_id, tier)
    DO NOTHING;
  END IF;
END;
$$;

-- Grant execute to authenticated users (service_role already has full access)
GRANT EXECUTE ON FUNCTION public.add_to_inventory(uuid, text, int, int) TO authenticated;
