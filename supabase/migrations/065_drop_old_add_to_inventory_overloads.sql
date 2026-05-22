-- Migration 065: Drop obsolete add_to_inventory overloads
-- 
-- Before migration 039, add_to_inventory used ON CONFLICT (character_id, item_id)
-- or plain UPDATE logic without a tier column. Migration 039 changed the PK of
-- character_inventory to (character_id, item_id, tier), breaking those versions.
--
-- Worse: having 3 overloads caused PostgreSQL to throw "function is not unique"
-- when called with 3 params (the existing call site signature), meaning the RPC
-- was silently failing with an ambiguity error.
--
-- Migration 064 deployed the correct 4-param version with p_tier DEFAULT 1.
-- Now we drop the two broken old versions so all calls resolve to the fixed one.

DROP FUNCTION IF EXISTS public.add_to_inventory(uuid, text, integer);
DROP FUNCTION IF EXISTS public.add_to_inventory(uuid, text, integer, text);
