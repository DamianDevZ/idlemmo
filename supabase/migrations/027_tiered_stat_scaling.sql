-- Replace divisor-based weapon scaling with a tiered flat-bonus system.
--
-- New formula:
--   stat_bonus = tier contributions summed, then multiplied by weapon grade
--   final_damage = weapon_base + ROUND(stat_bonus × grade_mult)
--
-- Tiers (defaults):
--   Levels  1–30 → 5 damage / stat point
--   Levels 31–60 → 3 damage / stat point
--   Levels 61–100 → 2 damage / stat point
--   Levels 101+   → 1 damage / stat point
--
-- Grade multipliers (hardcoded, reflect weapon quality):
--   F=1.0×  D=1.1×  C=1.2×  B=1.3×  A=1.4×  S=1.5×

-- ─── 1. Remove old divisor keys from game_config ──────────────────────────
DELETE FROM game_config
WHERE key IN ('str_scaling_divisor','dex_scaling_divisor','int_scaling_divisor');

-- ─── 2. Add tier rate and breakpoint keys ─────────────────────────────────
INSERT INTO game_config (key, label, description, value, min_value, max_value, step, category) VALUES
  ('stat_tier1_rate', 'Tier 1 Rate (lv 1–30)',
   'Flat damage added per stat point for the first tier of levels.',
   5, 0.1, 50, 0.1, 'combat_damage'),

  ('stat_tier2_rate', 'Tier 2 Rate (lv 31–60)',
   'Flat damage added per stat point for the second tier of levels.',
   3, 0.1, 50, 0.1, 'combat_damage'),

  ('stat_tier3_rate', 'Tier 3 Rate (lv 61–100)',
   'Flat damage added per stat point for the third tier of levels.',
   2, 0.1, 50, 0.1, 'combat_damage'),

  ('stat_tier4_rate', 'Tier 4 Rate (lv 101+)',
   'Flat damage added per stat point for any level above Tier 3 cap.',
   1, 0.1, 50, 0.1, 'combat_damage'),

  ('stat_tier1_cap', 'Tier 1 Cap',
   'Stat level where Tier 1 ends and Tier 2 begins.',
   30, 1, 500, 1, 'combat_damage'),

  ('stat_tier2_cap', 'Tier 2 Cap',
   'Stat level where Tier 2 ends and Tier 3 begins.',
   60, 1, 500, 1, 'combat_damage'),

  ('stat_tier3_cap', 'Tier 3 Cap',
   'Stat level where Tier 3 ends and Tier 4 begins.',
   100, 1, 500, 1, 'combat_damage');

-- ─── 3. Assign grades to existing weapons ─────────────────────────────────
UPDATE item_definitions SET primary_scaling_grade = 'F' WHERE name = 'crude_knife';
UPDATE item_definitions SET primary_scaling_grade = 'D' WHERE name IN ('serrated_blade','apprentice_staff');
UPDATE item_definitions SET primary_scaling_grade = 'C' WHERE name = 'iron_sword';
UPDATE item_definitions SET primary_scaling_grade = 'B' WHERE name IN ('iron_mace','crystal_staff');
UPDATE item_definitions SET primary_scaling_grade = 'A' WHERE name = 'mithril_staff';
UPDATE item_definitions SET primary_scaling_grade = 'S' WHERE name = 'void_staff';

-- ─── 4. Rewrite join_arena_queue with tiered scaling ──────────────────────
CREATE OR REPLACE FUNCTION public.join_arena_queue(p_character_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Config
  v_base_hp           numeric;
  v_hp_per_vigor      numeric;
  v_armor_divisor     numeric;
  v_unarmed_base      numeric;
  v_end_armor_factor  numeric;
  v_max_rounds        int;
  v_tier1_rate        numeric;
  v_tier2_rate        numeric;
  v_tier3_rate        numeric;
  v_tier4_rate        numeric;
  v_tier1_cap         int;
  v_tier2_cap         int;
  v_tier3_cap         int;

  -- Characters
  v_level             int;
  v_current_hp        int;
  v_opponent_id       uuid;
  v_char_name         text;
  v_opp_name          text;

  v_char_str  int; v_char_vigor int; v_char_end int; v_char_dex int; v_char_int int;
  v_opp_str   int; v_opp_vigor  int; v_opp_end  int; v_opp_dex  int; v_opp_int  int;

  -- Equipment
  v_char_weapon_name   text;
  v_char_weapon_base   numeric;
  v_char_dmg_type      text;
  v_char_scale_attr    text;
  v_char_scale_grade   text;
  v_char_armor_name    text;
  v_char_armor_bonus   numeric;

  v_opp_weapon_name    text;
  v_opp_weapon_base    numeric;
  v_opp_dmg_type       text;
  v_opp_scale_attr     text;
  v_opp_scale_grade    text;
  v_opp_armor_name     text;
  v_opp_armor_bonus    numeric;

  -- Combat calc
  v_char_scale_stat    float;
  v_opp_scale_stat     float;
  v_char_grade_mult    float;
  v_opp_grade_mult     float;
  v_char_stat_bonus    float;
  v_opp_stat_bonus     float;

  v_char_max_hp       int;   v_opp_max_hp    int;
  v_char_hp           float; v_opp_hp        float;
  v_char_raw          float; v_opp_raw       float;
  v_char_deflect      float; v_opp_deflect   float;

  v_char_net          float; v_opp_net       float;
  v_char_deflected    float; v_opp_deflected float;
  v_opp_hp_raw        float; v_char_hp_raw   float;

  -- Match
  v_combat_log        jsonb := '[]'::jsonb;
  v_log_n             int   := 1;
  v_round             int   := 1;

  v_char_wins         bool;
  v_winner_id         uuid;
  v_char_delta        int;   v_opp_delta     int;
  v_match_id          uuid;
  v_combat_starts_at  timestamptz;
  v_char_fighter_data jsonb;
  v_opp_fighter_data  jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM characters WHERE id = p_character_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Character not found or not yours';
  END IF;

  -- Load config
  SELECT value INTO v_base_hp          FROM game_config WHERE key = 'base_hp';
  SELECT value INTO v_hp_per_vigor     FROM game_config WHERE key = 'hp_per_vigor';
  SELECT value INTO v_armor_divisor    FROM game_config WHERE key = 'armor_divisor';
  SELECT value INTO v_unarmed_base     FROM game_config WHERE key = 'unarmed_base_damage';
  SELECT value INTO v_end_armor_factor FROM game_config WHERE key = 'end_armor_factor';
  SELECT value::int INTO v_max_rounds  FROM game_config WHERE key = 'max_combat_rounds';
  SELECT value INTO v_tier1_rate       FROM game_config WHERE key = 'stat_tier1_rate';
  SELECT value INTO v_tier2_rate       FROM game_config WHERE key = 'stat_tier2_rate';
  SELECT value INTO v_tier3_rate       FROM game_config WHERE key = 'stat_tier3_rate';
  SELECT value INTO v_tier4_rate       FROM game_config WHERE key = 'stat_tier4_rate';
  SELECT value::int INTO v_tier1_cap   FROM game_config WHERE key = 'stat_tier1_cap';
  SELECT value::int INTO v_tier2_cap   FROM game_config WHERE key = 'stat_tier2_cap';
  SELECT value::int INTO v_tier3_cap   FROM game_config WHERE key = 'stat_tier3_cap';

  SELECT main_level, current_hp, name
  INTO   v_level, v_current_hp, v_char_name
  FROM   characters WHERE id = p_character_id;

  IF v_current_hp <= 0 THEN
    RAISE EXCEPTION 'Restore HP before entering the arena';
  END IF;

  INSERT INTO arena_queue (character_id, main_level, queued_at, expires_at)
  VALUES (p_character_id, v_level, now(), now() + interval '2 minutes')
  ON CONFLICT (character_id) DO UPDATE SET
    main_level = EXCLUDED.main_level,
    queued_at  = now(),
    expires_at = now() + interval '2 minutes';

  SELECT aq.character_id INTO v_opponent_id
  FROM   arena_queue aq
  WHERE  aq.character_id != p_character_id
    AND  aq.main_level BETWEEN v_level - 5 AND v_level + 5
    AND  aq.expires_at > now()
  ORDER BY aq.queued_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_opponent_id IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  DELETE FROM arena_queue WHERE character_id IN (p_character_id, v_opponent_id);

  SELECT name INTO v_opp_name FROM characters WHERE id = v_opponent_id;

  SELECT COALESCE(strength,5), COALESCE(vigor,5), COALESCE(endurance,5),
         COALESCE(dexterity,5), COALESCE(intelligence,5)
  INTO   v_char_str, v_char_vigor, v_char_end, v_char_dex, v_char_int
  FROM   character_attributes WHERE character_id = p_character_id;

  SELECT COALESCE(strength,5), COALESCE(vigor,5), COALESCE(endurance,5),
         COALESCE(dexterity,5), COALESCE(intelligence,5)
  INTO   v_opp_str, v_opp_vigor, v_opp_end, v_opp_dex, v_opp_int
  FROM   character_attributes WHERE character_id = v_opponent_id;

  -- Fetch equipped weapon + scaling attr + grade
  SELECT id.display_name,
         COALESCE(id.base_damage, v_unarmed_base),
         COALESCE(id.primary_damage_type, 'strike'),
         COALESCE(id.primary_scaling_attr,  'str'),
         COALESCE(id.primary_scaling_grade, 'F')
  INTO   v_char_weapon_name, v_char_weapon_base, v_char_dmg_type,
         v_char_scale_attr,  v_char_scale_grade
  FROM   character_inventory ci
  JOIN   item_definitions id ON id.id = ci.item_id
  WHERE  ci.character_id = p_character_id AND ci.equipped_slot = 'weapon'
  LIMIT  1;

  v_char_weapon_base := COALESCE(v_char_weapon_base, v_unarmed_base);
  v_char_dmg_type    := COALESCE(v_char_dmg_type,    'strike');
  v_char_scale_attr  := COALESCE(v_char_scale_attr,  'str');
  v_char_scale_grade := COALESCE(v_char_scale_grade, 'F');

  SELECT id.display_name, COALESCE(id.base_defense, 0)
  INTO   v_char_armor_name, v_char_armor_bonus
  FROM   character_inventory ci
  JOIN   item_definitions id ON id.id = ci.item_id
  WHERE  ci.character_id = p_character_id AND ci.equipped_slot = 'chest'
  LIMIT  1;

  v_char_armor_bonus := COALESCE(v_char_armor_bonus, 0);

  SELECT id.display_name,
         COALESCE(id.base_damage, v_unarmed_base),
         COALESCE(id.primary_damage_type, 'strike'),
         COALESCE(id.primary_scaling_attr,  'str'),
         COALESCE(id.primary_scaling_grade, 'F')
  INTO   v_opp_weapon_name, v_opp_weapon_base, v_opp_dmg_type,
         v_opp_scale_attr,  v_opp_scale_grade
  FROM   character_inventory ci
  JOIN   item_definitions id ON id.id = ci.item_id
  WHERE  ci.character_id = v_opponent_id AND ci.equipped_slot = 'weapon'
  LIMIT  1;

  v_opp_weapon_base := COALESCE(v_opp_weapon_base, v_unarmed_base);
  v_opp_dmg_type    := COALESCE(v_opp_dmg_type,    'strike');
  v_opp_scale_attr  := COALESCE(v_opp_scale_attr,  'str');
  v_opp_scale_grade := COALESCE(v_opp_scale_grade, 'F');

  SELECT id.display_name, COALESCE(id.base_defense, 0)
  INTO   v_opp_armor_name, v_opp_armor_bonus
  FROM   character_inventory ci
  JOIN   item_definitions id ON id.id = ci.item_id
  WHERE  ci.character_id = v_opponent_id AND ci.equipped_slot = 'chest'
  LIMIT  1;

  v_opp_armor_bonus := COALESCE(v_opp_armor_bonus, 0);

  v_char_max_hp := (v_base_hp + v_char_vigor * v_hp_per_vigor)::int;
  v_opp_max_hp  := (v_base_hp + v_opp_vigor  * v_hp_per_vigor)::int;
  v_char_hp     := v_char_max_hp;
  v_opp_hp      := v_opp_max_hp;

  -- Which attribute each fighter scales with
  v_char_scale_stat := CASE v_char_scale_attr
    WHEN 'dex' THEN v_char_dex::float
    WHEN 'int' THEN v_char_int::float
    ELSE             v_char_str::float
  END;
  v_opp_scale_stat := CASE v_opp_scale_attr
    WHEN 'dex' THEN v_opp_dex::float
    WHEN 'int' THEN v_opp_int::float
    ELSE             v_opp_str::float
  END;

  -- Grade multipliers: F=1.0×  D=1.1×  C=1.2×  B=1.3×  A=1.4×  S=1.5×
  v_char_grade_mult := CASE v_char_scale_grade
    WHEN 'S' THEN 1.5 WHEN 'A' THEN 1.4 WHEN 'B' THEN 1.3
    WHEN 'C' THEN 1.2 WHEN 'D' THEN 1.1 ELSE          1.0
  END;
  v_opp_grade_mult := CASE v_opp_scale_grade
    WHEN 'S' THEN 1.5 WHEN 'A' THEN 1.4 WHEN 'B' THEN 1.3
    WHEN 'C' THEN 1.2 WHEN 'D' THEN 1.1 ELSE          1.0
  END;

  -- Tiered stat contribution (diminishing returns across four brackets)
  v_char_stat_bonus :=
    LEAST(v_char_scale_stat, v_tier1_cap::float)                                          * v_tier1_rate +
    GREATEST(0.0, LEAST(v_char_scale_stat, v_tier2_cap::float) - v_tier1_cap::float)     * v_tier2_rate +
    GREATEST(0.0, LEAST(v_char_scale_stat, v_tier3_cap::float) - v_tier2_cap::float)     * v_tier3_rate +
    GREATEST(0.0, v_char_scale_stat - v_tier3_cap::float)                                * v_tier4_rate;

  v_opp_stat_bonus :=
    LEAST(v_opp_scale_stat, v_tier1_cap::float)                                           * v_tier1_rate +
    GREATEST(0.0, LEAST(v_opp_scale_stat, v_tier2_cap::float) - v_tier1_cap::float)      * v_tier2_rate +
    GREATEST(0.0, LEAST(v_opp_scale_stat, v_tier3_cap::float) - v_tier2_cap::float)      * v_tier3_rate +
    GREATEST(0.0, v_opp_scale_stat - v_tier3_cap::float)                                 * v_tier4_rate;

  -- final_damage = weapon_base + round(stat_bonus × grade_mult), min 1
  v_char_raw := GREATEST(1.0, v_char_weapon_base::float + ROUND(v_char_stat_bonus * v_char_grade_mult));
  v_opp_raw  := GREATEST(1.0, v_opp_weapon_base::float  + ROUND(v_opp_stat_bonus  * v_opp_grade_mult));

  v_char_deflect := (v_char_end::float * v_end_armor_factor::float + v_char_armor_bonus::float)
                    / (v_char_end::float * v_end_armor_factor::float + v_char_armor_bonus::float + v_armor_divisor::float);
  v_opp_deflect  := (v_opp_end::float  * v_end_armor_factor::float + v_opp_armor_bonus::float)
                    / (v_opp_end::float  * v_end_armor_factor::float + v_opp_armor_bonus::float  + v_armor_divisor::float);

  v_char_hp_raw := v_char_max_hp;
  v_opp_hp_raw  := v_opp_max_hp;

  WHILE v_char_hp > 0 AND v_opp_hp > 0 AND v_round <= v_max_rounds LOOP

    v_char_deflected := v_char_raw * v_opp_deflect;
    v_char_net       := GREATEST(1.0, v_char_raw - v_char_deflected);

    v_opp_deflected  := v_opp_raw * v_char_deflect;
    v_opp_net        := GREATEST(1.0, v_opp_raw - v_opp_deflected);

    v_opp_hp_raw  := v_opp_hp  - v_char_net;
    v_char_hp_raw := v_char_hp - v_opp_net;

    v_combat_log := v_combat_log || jsonb_build_object(
      'n', v_log_n, 'attacker', v_char_name, 'defender', v_opp_name,
      'rawDamage', ROUND(v_char_raw::numeric, 1),
      'deflected', ROUND(v_char_deflected::numeric, 1),
      'netDamage', ROUND(v_char_net::numeric, 1),
      'type', v_char_dmg_type,
      'atkHp', ROUND(v_char_hp::numeric),
      'defHpBefore', ROUND(v_opp_hp::numeric),
      'defHpAfter', ROUND(GREATEST(0.0, v_opp_hp_raw)::numeric)
    );
    v_log_n := v_log_n + 1;

    v_combat_log := v_combat_log || jsonb_build_object(
      'n', v_log_n, 'attacker', v_opp_name, 'defender', v_char_name,
      'rawDamage', ROUND(v_opp_raw::numeric, 1),
      'deflected', ROUND(v_opp_deflected::numeric, 1),
      'netDamage', ROUND(v_opp_net::numeric, 1),
      'type', v_opp_dmg_type,
      'atkHp', ROUND(v_opp_hp::numeric),
      'defHpBefore', ROUND(v_char_hp::numeric),
      'defHpAfter', ROUND(GREATEST(0.0, v_char_hp_raw)::numeric)
    );
    v_log_n := v_log_n + 1;
    v_round  := v_round + 1;

    v_char_hp := GREATEST(0.0, v_char_hp_raw);
    v_opp_hp  := GREATEST(0.0, v_opp_hp_raw);
  END LOOP;

  -- Tiebreaker: both <= 0 — further below zero loses (more overkill = loss)
  IF v_char_hp_raw <= 0 AND v_opp_hp_raw <= 0 THEN
    v_char_wins := v_char_hp_raw >= v_opp_hp_raw;
  ELSE
    v_char_wins := v_char_hp > 0;
  END IF;

  v_winner_id        := CASE WHEN v_char_wins THEN p_character_id ELSE v_opponent_id END;
  v_char_delta       := CASE WHEN v_char_wins THEN 30 ELSE -10 END;
  v_opp_delta        := CASE WHEN v_char_wins THEN -10 ELSE 30 END;
  v_combat_starts_at := now() + interval '5 seconds';

  v_char_fighter_data := jsonb_build_object(
    'str', v_char_str, 'end', v_char_end, 'dex', v_char_dex, 'vig', v_char_vigor,
    'int', v_char_int, 'scaleAttr', v_char_scale_attr, 'scaleGrade', v_char_scale_grade,
    'weaponName', v_char_weapon_name, 'damageType', v_char_dmg_type,
    'weaponBase', v_char_weapon_base, 'armorName', v_char_armor_name,
    'armorBonus', v_char_armor_bonus
  );
  v_opp_fighter_data := jsonb_build_object(
    'str', v_opp_str, 'end', v_opp_end, 'dex', v_opp_dex, 'vig', v_opp_vigor,
    'int', v_opp_int, 'scaleAttr', v_opp_scale_attr, 'scaleGrade', v_opp_scale_grade,
    'weaponName', v_opp_weapon_name, 'damageType', v_opp_dmg_type,
    'weaponBase', v_opp_weapon_base, 'armorName', v_opp_armor_name,
    'armorBonus', v_opp_armor_bonus
  );

  INSERT INTO arena_matches (
    player1_id, player2_id, winner_id,
    status, completed_at,
    player1_rating_delta, player2_rating_delta,
    player1_max_hp, player2_max_hp,
    combat_starts_at,
    player1_fighter_data, player2_fighter_data,
    combat_log
  ) VALUES (
    p_character_id, v_opponent_id, v_winner_id,
    'completed', now(),
    v_char_delta, v_opp_delta,
    v_char_max_hp, v_opp_max_hp,
    v_combat_starts_at,
    v_char_fighter_data, v_opp_fighter_data,
    v_combat_log
  )
  RETURNING id INTO v_match_id;

  INSERT INTO arena_ratings (character_id, rating, wins, losses)
  VALUES (p_character_id,
          GREATEST(0, 1000 + v_char_delta),
          CASE WHEN v_char_wins THEN 1 ELSE 0 END,
          CASE WHEN v_char_wins THEN 0 ELSE 1 END)
  ON CONFLICT (character_id) DO UPDATE SET
    rating  = GREATEST(0, arena_ratings.rating + v_char_delta),
    wins    = arena_ratings.wins   + CASE WHEN v_char_wins THEN 1 ELSE 0 END,
    losses  = arena_ratings.losses + CASE WHEN v_char_wins THEN 0 ELSE 1 END;

  INSERT INTO arena_ratings (character_id, rating, wins, losses)
  VALUES (v_opponent_id,
          GREATEST(0, 1000 + v_opp_delta),
          CASE WHEN NOT v_char_wins THEN 1 ELSE 0 END,
          CASE WHEN NOT v_char_wins THEN 0 ELSE 1 END)
  ON CONFLICT (character_id) DO UPDATE SET
    rating  = GREATEST(0, arena_ratings.rating + v_opp_delta),
    wins    = arena_ratings.wins   + CASE WHEN NOT v_char_wins THEN 1 ELSE 0 END,
    losses  = arena_ratings.losses + CASE WHEN NOT v_char_wins THEN 0 ELSE 1 END;

  RETURN jsonb_build_object(
    'matched',             true,
    'won',                 v_char_wins,
    'yourName',            v_char_name,
    'opponentName',        v_opp_name,
    'yourMaxHp',           v_char_max_hp,
    'opponentMaxHp',       v_opp_max_hp,
    'ratingDelta',         v_char_delta,
    'combatStartsAt',      v_combat_starts_at,
    'yourFighterData',     v_char_fighter_data,
    'opponentFighterData', v_opp_fighter_data,
    'combatLog',           v_combat_log
  );
END;
$$;
