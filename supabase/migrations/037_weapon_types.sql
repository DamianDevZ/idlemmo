-- Weapon types are tags used to categorise weapons (sword, hammer, bow, etc.)
-- and to restrict which Ultimates can be bound to which weapon.

CREATE TABLE IF NOT EXISTS weapon_types (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL UNIQUE,   -- internal slug  e.g. 'sword'
  display_name text        NOT NULL,          -- shown in UI    e.g. 'Sword'
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Weapons carry a single weapon_type_id (nullable — not all weapons need a type)
ALTER TABLE item_definitions
  ADD COLUMN IF NOT EXISTS weapon_type_id uuid REFERENCES weapon_types(id) ON DELETE SET NULL;

-- Ultimates (special_attack items) store an array of compatible weapon_type ids
ALTER TABLE item_definitions
  ADD COLUMN IF NOT EXISTS compatible_weapon_type_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN item_definitions.weapon_type_id IS
  'For weapons: the weapon type tag (sword, hammer, bow…). Null = untyped.';
COMMENT ON COLUMN item_definitions.compatible_weapon_type_ids IS
  'For ultimates (special_attack): array of weapon_type UUIDs this ultimate can be bound to.';
