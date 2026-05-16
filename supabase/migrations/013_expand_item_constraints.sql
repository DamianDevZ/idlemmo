-- Expand item_definitions constraints to cover all weapon/armor categories

-- ── material_type ────────────────────────────────────────────────────────────
-- Add 'wood' (bows, staves) and 'stone' (primitive tools/weapons)
alter table public.item_definitions
  drop constraint if exists item_definitions_material_type_check;

alter table public.item_definitions
  add constraint item_definitions_material_type_check
    check (material_type in ('metal','leather','cloth','wood','stone'));

-- ── primary_damage_type ──────────────────────────────────────────────────────
-- Add 'dark' and 'holy' for void/faith weapons
alter table public.item_definitions
  drop constraint if exists item_definitions_primary_damage_type_check;

alter table public.item_definitions
  add constraint item_definitions_primary_damage_type_check
    check (primary_damage_type in (
      'slash','blunt','bleed','pierce',
      'fire','ice','lightning','poison',
      'dark','holy','true'
    ));

-- ── scaling attrs ────────────────────────────────────────────────────────────
-- Add 'fth' (faith) and 'arc' (arcane) for paladin / mage builds
alter table public.item_definitions
  drop constraint if exists item_definitions_primary_scaling_attr_check;

alter table public.item_definitions
  drop constraint if exists item_definitions_secondary_scaling_attr_check;

alter table public.item_definitions
  add constraint item_definitions_primary_scaling_attr_check
    check (primary_scaling_attr in ('str','dex','int','fth','arc')),
  add constraint item_definitions_secondary_scaling_attr_check
    check (secondary_scaling_attr in ('str','dex','int','fth','arc'));
