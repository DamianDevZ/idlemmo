-- Migration 010: Add tool equipment slots to character_inventory
-- Expands the equipped_slot constraint to include 4 tool slots:
--   tool_axe      → woodcutting axes
--   tool_pickaxe  → mining/stonecutting pickaxes
--   tool_rod      → fishing rods
--   tool_sickle   → gathering sickles / scythes

alter table public.character_inventory
  drop constraint if exists character_inventory_equipped_slot_check;

alter table public.character_inventory
  add constraint character_inventory_equipped_slot_check
  check (equipped_slot in (
    'weapon','offhand','head','chest','legs','hands','feet','ring','amulet',
    'tool_axe','tool_pickaxe','tool_rod','tool_sickle'
  ));
