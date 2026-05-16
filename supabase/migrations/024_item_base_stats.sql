-- Set base_damage for all weapons and base_defense for all armor.
-- Previously most items had NULL, making them useless in combat.
-- Formula reference:
--   damage   = base_damage * (1 + STR / str_melee_divisor)
--   deflect  = (END*5 + base_defense) / (END*5 + base_defense + 100)

-- ─── Weapons ──────────────────────────────────────────────────────────────────
UPDATE item_definitions SET base_damage = 22, primary_damage_type = 'pierce'  WHERE name = 'crude_knife';
UPDATE item_definitions SET base_damage = 24, primary_damage_type = 'bleed'   WHERE name = 'serrated_blade';
UPDATE item_definitions SET base_damage = 35, primary_damage_type = 'slash'   WHERE name = 'iron_sword';
UPDATE item_definitions SET base_damage = 38, primary_damage_type = 'blunt'   WHERE name = 'iron_mace';
UPDATE item_definitions SET base_damage = 20, primary_damage_type = 'fire'    WHERE name = 'apprentice_staff';
UPDATE item_definitions SET base_damage = 45, primary_damage_type = 'ice'     WHERE name = 'crystal_staff';
UPDATE item_definitions SET base_damage = 60, primary_damage_type = 'lightning' WHERE name = 'mithril_staff';
UPDATE item_definitions SET base_damage = 80, primary_damage_type = 'poison'  WHERE name = 'void_staff';

-- ─── Armor ────────────────────────────────────────────────────────────────────
-- Leather / Hide
UPDATE item_definitions SET base_defense = 20 WHERE name = 'basic_leathers';
UPDATE item_definitions SET base_defense = 30 WHERE name = 'cured_leather_armor';
UPDATE item_definitions SET base_defense = 45 WHERE name = 'thick_leather_armor';
UPDATE item_definitions SET base_defense = 70 WHERE name = 'dragonscale_armor';
UPDATE item_definitions SET base_defense = 95 WHERE name = 'shadow_leather_armor';

-- Plate
UPDATE item_definitions SET base_defense = 35 WHERE name = 'copper_plate';
UPDATE item_definitions SET base_defense = 55 WHERE name = 'iron_plate';
UPDATE item_definitions SET base_defense = 80 WHERE name = 'steel_plate';
UPDATE item_definitions SET base_defense = 115 WHERE name = 'mithril_plate';
UPDATE item_definitions SET base_defense = 160 WHERE name = 'void_plate';

-- Robes
UPDATE item_definitions SET base_defense = 12 WHERE name = 'cotton_robe';
UPDATE item_definitions SET base_defense = 22 WHERE name = 'silk_robe';
UPDATE item_definitions SET base_defense = 38 WHERE name = 'velvet_robe';
UPDATE item_definitions SET base_defense = 60 WHERE name = 'starweave_robe';
UPDATE item_definitions SET base_defense = 90 WHERE name = 'void_robe';

-- Also sync the stats jsonb column so both systems agree
UPDATE item_definitions
SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{armor_rating}', to_jsonb(base_defense))
WHERE type = 'armor' AND base_defense IS NOT NULL;

UPDATE item_definitions
SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{weapon_damage}', to_jsonb(base_damage))
WHERE type = 'weapon' AND base_damage IS NOT NULL;
