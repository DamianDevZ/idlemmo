-- Migration 042: Remove the `tier` column from areas.
-- Areas are biomes — they don't have a single tier.
-- Loot is configured per area × tier via area_tier_loot.
alter table public.areas drop column if exists tier;
