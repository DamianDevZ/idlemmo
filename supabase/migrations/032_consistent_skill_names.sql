-- Gathering skills
UPDATE skills SET name = 'lumber_gathering', display_name = 'Lumber Gathering' WHERE name = 'lumberjacking';
UPDATE skills SET name = 'hide_gathering',   display_name = 'Hide Gathering'   WHERE name = 'skinning';
UPDATE skills SET name = 'ore_gathering',    display_name = 'Ore Gathering'    WHERE name = 'mining';
UPDATE skills SET name = 'fiber_gathering',  display_name = 'Fiber Gathering'  WHERE name = 'harvesting';
UPDATE skills SET name = 'stone_gathering',  display_name = 'Stone Gathering'  WHERE name = 'stonecutting';

-- Refining skills (mirror gathering with Refining suffix)
UPDATE skills SET name = 'lumber_refining', display_name = 'Lumber Refining' WHERE name = 'woodcutting';
UPDATE skills SET name = 'hide_refining',   display_name = 'Hide Refining'   WHERE name = 'tanning';
UPDATE skills SET name = 'ore_refining',    display_name = 'Ore Refining'    WHERE name = 'smelting';
UPDATE skills SET name = 'fiber_refining',  display_name = 'Fiber Refining'  WHERE name = 'weaving';
UPDATE skills SET name = 'stone_refining',  display_name = 'Stone Refining'  WHERE name = 'masonry';
