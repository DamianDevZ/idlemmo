-- Rename refining stonecutting → masonry FIRST to free up the name
UPDATE skills SET name = 'masonry', display_name = 'Masonry'
  WHERE name = 'stonecutting'
    AND category_id = (SELECT id FROM skill_categories WHERE name = 'refining');

-- Now rename gathering skills
UPDATE skills SET name = 'lumberjacking', display_name = 'Lumberjacking' WHERE name = 'wood_chopping';
UPDATE skills SET name = 'mining',         display_name = 'Mining'         WHERE name = 'ore_mining';
UPDATE skills SET name = 'harvesting',     display_name = 'Harvesting'     WHERE name = 'herb_gathering';
UPDATE skills SET name = 'skinning',       display_name = 'Skinning'       WHERE name = 'hunting';
UPDATE skills SET name = 'stonecutting',   display_name = 'Stonecutting'   WHERE name = 'stone_mining';

-- Remove fishing
DELETE FROM skills WHERE name = 'fishing';
