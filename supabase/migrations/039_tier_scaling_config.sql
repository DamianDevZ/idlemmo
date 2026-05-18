-- Tier Scaling Config
-- ─────────────────────────────────────────────────────────────────────────────
-- One item definition now covers ALL tiers (is_tiered = true means the item
-- exists at T1 through max_tier). The actual tier lives on the inventory row,
-- not on the item definition.
--
-- This table configures HOW stats scale as tier increases.
-- multiplier is applied to the base stat stored on the item definition.
-- T1 multiplier = 1.0  →  base value exactly as typed.
-- T2 multiplier = 1.20 →  20% stronger than T1, etc.

CREATE TABLE IF NOT EXISTS tier_scaling_config (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type  text    NOT NULL CHECK (item_type IN
               ('weapon','armor','tool','consumable','special_attack','material','misc')),
  stat_key   text    NOT NULL,  -- matches item_definitions column or known jsonb path
  stat_label text    NOT NULL,
  tier       int     NOT NULL CHECK (tier BETWEEN 1 AND 20),
  multiplier numeric NOT NULL DEFAULT 1.0,
  UNIQUE (item_type, stat_key, tier)
);

COMMENT ON TABLE tier_scaling_config IS
  'Per-type, per-stat multipliers for each tier. '
  'base_stat × multiplier = stat at that tier. T1 = 1.0 = the value on the item definition.';

-- ─── Inventory gets a tier column ────────────────────────────────────────────
-- Each inventory/stash slot now tracks which tier the item is.
-- The PK includes tier so a player can hold T2 and T3 of the same weapon.

ALTER TABLE character_inventory ADD COLUMN IF NOT EXISTS tier int NOT NULL DEFAULT 1;
ALTER TABLE character_stash     ADD COLUMN IF NOT EXISTS tier int NOT NULL DEFAULT 1;

ALTER TABLE character_inventory DROP CONSTRAINT IF EXISTS character_inventory_pkey;
ALTER TABLE character_inventory ADD PRIMARY KEY (character_id, item_id, tier);

ALTER TABLE character_stash DROP CONSTRAINT IF EXISTS character_stash_pkey;
ALTER TABLE character_stash ADD PRIMARY KEY (character_id, item_id, tier);

-- ─── Seed defaults: 20% compound growth per tier ─────────────────────────────
-- multiplier = round(1.2^(tier-1), 2)
-- T1=1.00  T2=1.20  T3=1.44  T4=1.73  T5=2.07
-- T6=2.49  T7=2.99  T8=3.58  T9=4.30  T10=5.16
--
-- Admins can adjust these freely via /admin/tier-scaling.

INSERT INTO tier_scaling_config (item_type, stat_key, stat_label, tier, multiplier) VALUES
  -- Weapon: base damage scales, attack_speed does NOT (identity of the weapon)
  ('weapon','base_damage','Base Damage', 1, 1.00),
  ('weapon','base_damage','Base Damage', 2, 1.20),
  ('weapon','base_damage','Base Damage', 3, 1.44),
  ('weapon','base_damage','Base Damage', 4, 1.73),
  ('weapon','base_damage','Base Damage', 5, 2.07),
  ('weapon','base_damage','Base Damage', 6, 2.49),
  ('weapon','base_damage','Base Damage', 7, 2.99),
  ('weapon','base_damage','Base Damage', 8, 3.58),
  ('weapon','base_damage','Base Damage', 9, 4.30),
  ('weapon','base_damage','Base Damage',10, 5.16),
  -- Tool: yield range scales
  ('tool','yield_min','Yield Min', 1, 1.00),
  ('tool','yield_min','Yield Min', 2, 1.20),
  ('tool','yield_min','Yield Min', 3, 1.44),
  ('tool','yield_min','Yield Min', 4, 1.73),
  ('tool','yield_min','Yield Min', 5, 2.07),
  ('tool','yield_min','Yield Min', 6, 2.49),
  ('tool','yield_min','Yield Min', 7, 2.99),
  ('tool','yield_min','Yield Min', 8, 3.58),
  ('tool','yield_min','Yield Min', 9, 4.30),
  ('tool','yield_min','Yield Min',10, 5.16),
  ('tool','yield_max','Yield Max', 1, 1.00),
  ('tool','yield_max','Yield Max', 2, 1.20),
  ('tool','yield_max','Yield Max', 3, 1.44),
  ('tool','yield_max','Yield Max', 4, 1.73),
  ('tool','yield_max','Yield Max', 5, 2.07),
  ('tool','yield_max','Yield Max', 6, 2.49),
  ('tool','yield_max','Yield Max', 7, 2.99),
  ('tool','yield_max','Yield Max', 8, 3.58),
  ('tool','yield_max','Yield Max', 9, 4.30),
  ('tool','yield_max','Yield Max',10, 5.16)
ON CONFLICT (item_type, stat_key, tier) DO NOTHING;
