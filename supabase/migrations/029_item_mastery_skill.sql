-- Add mastery (equip) skill requirement to item definitions
-- Weapons and armor can require a character to have a usage skill at a certain level
ALTER TABLE item_definitions
  ADD COLUMN required_mastery_skill_id uuid REFERENCES skills(id) ON DELETE SET NULL,
  ADD COLUMN required_mastery_level     int  NOT NULL DEFAULT 1 CHECK (required_mastery_level BETWEEN 1 AND 99);
