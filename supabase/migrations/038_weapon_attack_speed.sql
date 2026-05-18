-- Attack speed on weapons: how many times per second the weapon attacks.
--
-- Reference values:
--   0.50 → 1 hit every 2.0s  (very slow — greatswords, mauls)
--   0.75 → 1 hit every 1.3s  (slow    — longswords, warhammers)
--   1.00 → 1 hit per second   (normal  — swords, spears)
--   1.50 → 3 hits every 2.0s  (fast    — daggers, short swords)
--   2.00 → 2 hits per second  (very fast — dual daggers, claws)
--
-- DPS formula (before attribute scaling):
--   DPS = base_damage × attack_speed

ALTER TABLE item_definitions
  ADD COLUMN IF NOT EXISTS attack_speed numeric NOT NULL DEFAULT 1.0;

COMMENT ON COLUMN item_definitions.attack_speed IS
  'Attacks per second. DPS = base_damage × attack_speed. Default 1.0.';
