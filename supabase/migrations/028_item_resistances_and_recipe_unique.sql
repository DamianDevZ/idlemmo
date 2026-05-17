-- Migration 028: Per-item armor resistances + one-recipe-per-item constraint
--
-- Each armor item now carries its own resistance map directly in item_definitions.
-- Format: { "slash": { "value": 40, "mode": "percent" }, "fire": { "value": 20, "mode": "flat" }, … }
-- Positive value = damage reduced; negative = weakness (more damage taken).
-- mode "percent" → final = raw × (1 - value/100)
-- mode "flat"    → final = raw - value  (capped at min 1)
-- "true" damage bypasses all resistances regardless.

-- ── 1. Add resistances column ─────────────────────────────────────────────────
ALTER TABLE public.item_definitions
  ADD COLUMN IF NOT EXISTS resistances jsonb NOT NULL DEFAULT '{}';

-- ── 2. Backfill existing armor items from armor_presets ───────────────────────
-- leather items → 'leather' preset; metal items → 'plate' preset (closest match);
-- cloth items → 'cloth' preset. All existing entries default to percent mode.
UPDATE public.item_definitions upd
SET    resistances = sub.res
FROM (
  SELECT id.id,
         jsonb_object_agg(kv.key, jsonb_build_object('value', (kv.value)::int, 'mode', 'percent')) AS res
  FROM   public.item_definitions id
  JOIN   public.armor_presets ap
         ON ap.id = CASE id.material_type
                      WHEN 'metal'   THEN 'plate'
                      WHEN 'leather' THEN 'leather'
                      WHEN 'cloth'   THEN 'cloth'
                      ELSE id.material_type
                    END
  CROSS JOIN LATERAL jsonb_each_text(ap.resistances) AS kv
  WHERE  id.type = 'armor'
  GROUP BY id.id
) sub
WHERE upd.id = sub.id;

-- ── 3. One recipe per output item (admin creates one recipe per item) ──────────
-- If you later need multiple recipes for the same item, drop this constraint.
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_output_item_unique UNIQUE (output_item_id);
