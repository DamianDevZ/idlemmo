-- Migration 049: Add explicit tool_slot column to item_definitions
-- Previously the equip code inferred the equipment slot from keywords in the item name.
-- This explicit column lets freely-named tools map to the correct slot without
-- relying on name conventions.

ALTER TABLE public.item_definitions
  ADD COLUMN IF NOT EXISTS tool_slot text
    CHECK (tool_slot IN ('tool_pickaxe','tool_axe','tool_hammer','tool_sickle','tool_knife'));

COMMENT ON COLUMN public.item_definitions.tool_slot IS
  'For tool-type items: the equipment slot this tool occupies. '
  'NULL = fall back to name-keyword inference for backward compatibility.';
