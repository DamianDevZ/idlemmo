-- Migration 045: Add item_tier to area_tier_loot
-- Allows admins to specify what tier an item drops at (e.g. drop T2 stone in a T3 zone).
-- Null means "use the area tier at runtime".

alter table public.area_tier_loot
  add column item_tier int check (item_tier between 1 and 10);
