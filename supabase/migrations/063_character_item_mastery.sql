-- Migration 063: Per-item mastery discovery and XP tracking
--
-- Replaces the old fixed skill-per-category model (character_skills) with a
-- dynamic per-item-definition mastery table.  Each row tracks how much mastery
-- XP a character has sunk into one specific item definition within one skill
-- category (e.g. "Iron Sword" in "weapon_mastery").
--
-- Discovery: a row is inserted the first time an item enters the inventory via
-- exploration, crafting, or loot drops.  INSERT … ON CONFLICT DO NOTHING keeps
-- it idempotent.

CREATE TABLE IF NOT EXISTS character_item_mastery (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
  character_id        UUID        NOT NULL REFERENCES characters(id)       ON DELETE CASCADE,
  item_definition_id  UUID        NOT NULL REFERENCES item_definitions(id) ON DELETE CASCADE,
  -- Matches skill_categories.name: weapon_mastery, armor_mastery, tool_mastery,
  -- weapon_crafting, armor_crafting, tool_crafting, refining
  category_name       TEXT        NOT NULL,
  -- Current mastery tier (0 = discovered, can use T1 of this item).
  -- Spending XP advances the tier so the character can equip higher-tier variants.
  tier                INT         NOT NULL DEFAULT 0,
  xp_toward_next_tier INT         NOT NULL DEFAULT 0,
  discovered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT character_item_mastery_pkey PRIMARY KEY (id),
  CONSTRAINT character_item_mastery_unique
    UNIQUE (character_id, item_definition_id, category_name)
);

-- Fast lookup for the Skills page: fetch all items a character has discovered
-- within one category.
CREATE INDEX IF NOT EXISTS idx_cim_char_cat
  ON character_item_mastery (character_id, category_name);
