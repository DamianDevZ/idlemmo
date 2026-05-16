-- Correct weapon base_damage values — all must exceed unarmed_base (25)
-- so equipping a weapon is always an upgrade over fighting with fists.
UPDATE item_definitions SET base_damage = 30 WHERE name = 'crude_knife';       -- T1 pierce
UPDATE item_definitions SET base_damage = 33 WHERE name = 'serrated_blade';    -- T1 bleed
UPDATE item_definitions SET base_damage = 28 WHERE name = 'apprentice_staff';  -- T1 fire
UPDATE item_definitions SET base_damage = 42 WHERE name = 'iron_sword';        -- T2 slash
UPDATE item_definitions SET base_damage = 46 WHERE name = 'iron_mace';         -- T2 blunt
UPDATE item_definitions SET base_damage = 58 WHERE name = 'crystal_staff';     -- T3 ice
UPDATE item_definitions SET base_damage = 75 WHERE name = 'mithril_staff';     -- T4 lightning
UPDATE item_definitions SET base_damage = 100 WHERE name = 'void_staff';       -- T5 poison

UPDATE item_definitions
SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{weapon_damage}', to_jsonb(base_damage))
WHERE type = 'weapon' AND base_damage IS NOT NULL;
