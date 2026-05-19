-- Migration 050: HP passive regen + rage-per-hit config + campsite interval config

-- Track when HP was last regenerated so we can compute time-elapsed regen on page load.
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS last_regen_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.characters.last_regen_at IS
  'Timestamp of last passive HP regen calculation. Updated every game page load.';

-- Rage earned per hit taken in exploration combat. Admin-configurable.
INSERT INTO game_config (category, sort_order, key, label, description, value, default_value, min_value, max_value, step, unit)
VALUES
  ('exploration', 7, 'rage_per_hit', 'Rage per Hit Taken',
   'How much rage fills per hit the player receives in exploration combat. At 100 rage the bound ultimate fires automatically.',
   20, 20, 1, 100, 1, 'rage')
ON CONFLICT (key) DO NOTHING;

-- Campsite fires every N ticks within a session (was in code but missing from DB seed).
INSERT INTO game_config (category, sort_order, key, label, description, value, default_value, min_value, max_value, step, unit)
VALUES
  ('exploration', 8, 'campsite_every_ticks', 'Campsite Interval',
   'A campsite rest event fires every N exploration ticks within a session.',
   5, 5, 1, 50, 1, 'ticks')
ON CONFLICT (key) DO NOTHING;
