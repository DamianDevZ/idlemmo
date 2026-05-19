-- Migration 048: Add area_id / area_tier to exploration_sessions
-- Enables the new areas system (area_tier_loot + area_tier_enemies) for exploration.
-- biome_tier_id is made nullable so legacy sessions remain valid while we transition.
-- New sessions set area_id + area_tier; the tick route checks which is present.

ALTER TABLE public.exploration_sessions
  ALTER COLUMN biome_tier_id DROP NOT NULL;

ALTER TABLE public.exploration_sessions
  ADD COLUMN area_id   uuid REFERENCES public.areas(id),
  ADD COLUMN area_tier int  CHECK (area_tier BETWEEN 1 AND 10);
