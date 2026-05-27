-- Drop base_success_chance from recipes — crafting always succeeds if mastery
-- and ingredient requirements are met. RNG success rate was never implemented.
ALTER TABLE public.recipes DROP COLUMN IF EXISTS base_success_chance;
