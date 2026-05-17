-- Material subtypes: raw (gathered), refined (crafted from raw), unique (special drops)
-- gathering_skill_id links a raw material to the skill that produces it
ALTER TABLE item_definitions
  ADD COLUMN material_subtype    text CHECK (material_subtype IN ('raw', 'refined', 'unique')),
  ADD COLUMN gathering_skill_id  uuid REFERENCES skills(id) ON DELETE SET NULL;
