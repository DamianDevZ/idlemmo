-- Replace alternating strike system with simultaneous rounds:
-- Both fighters damage each other at the same time each round.
-- DEX only determines log display order within a round + tiebreaker when both die.
-- This eliminates "first striker always wins" while keeping DEX meaningful.
-- Adds max_combat_rounds to game_config (default 25).

INSERT INTO game_config (category, sort_order, key, label, description, value, default_value, min_value, max_value, step, unit)
VALUES ('combat_damage', 7, 'max_combat_rounds', 'Max Combat Rounds',
  'Maximum number of simultaneous-strike rounds before the fight is called a draw (higher DEX wins).',
  25, 25, 5, 100, 1, 'rounds')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.join_arena_queue(p_character_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_hp           numeric;
  v_hp_per_vigor      numeric;
  v_str_divisor       numeric;
  v_armor_divisor     numeric;
  v_unarmed_base      numeric;
  v_end_armor_factor  numeric;
  v_max_rounds        int;

  v_level             int;
  v_current_hp        int;
  v_opponent_id       uuid;

  v_char_name         text;
  v_opp_name          text;

  v_char_str          int;  v_char_vigor int;  v_char_end int;  v_char_dex int;
  v_opp_str           int;  v_opp_vigor  int;  v_opp_end  int;  v_opp_dex  int;

  v_char_weapon_name  text;
  v_char_weapon_base  numeric;
  v_char_dmg_type     text;
  v_char_armor_name   text;
  v_char_armor_bonus  numeric;
  v_opp_weapon_name   text;
  v_opp_weapon_base   numeric;
  v_opp_dmg_type      text;
  v_opp_armor_name    text;
  v_opp_armor_bonus   numeric;

  v_char_max_hp       int;   v_opp_max_hp    int;
  v_char_hp           float; v_opp_hp        float;
  v_char_raw          float; v_opp_raw       float;
  v_char_deflect      float; v_opp_deflect   float;

  v_char_net          float; v_opp_net       float;
  v_char_deflected    float; v_opp_deflected float;
  v_opp_hp_new        float; v_char_hp_new   float;

  v_combat_log        jsonb := '[]'::jsonb;
  v_log_n             int   := 1;
  v_round             int   := 1;

  v_char_logs_first   bool;

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

  SELECT value INTO v_base_hp          FROM game_config WHERE key = 'base_hp';
  SELECT value INTO v_hp_per_vigor     FROM game_config WHERE key = 'hp_per_vigor';
  SELECT value INTO v_str_divisor      FROM game_config WHERE key = 'str_melee_divisor';
  SELECT value INTO v_armor_divisor    FROM game_config WHERE key = 'armor_divisor';
  SELECT value INTO v_unarmed_base     FROM game_config WHERE key = 'unarmed_base_damage';
  SELECT value INTO v_end_armor_factor FROM game_config WHERE key = 'end_armor_factor';
  SELECT value::int INTO v_max_rounds  FROM game_config WHERE key = 'max_combat_rounds';

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

  SELECT COALESCE(strength,5), COALESCE(vigor,5), COALESCE(endurance,5), COALESCE(dexterity,5)
  INTO   v_char_str, v_char_vigor, v_char_end, v_char_dex
  FROM   character_attributes WHERE character_id = p_character_id;

  SELECT COALESCE(strength,5), COALESCE(vigor,5), COALESCE(endurance,5), COALESCE(dexterity,5)
  INTO   v_opp_str, v_opp_vigor, v_opp_end, v_opp_dex
  FROM   character_attributes WHERE character_id = v_opponent_id;

  SELECT id.display_name,
         COALESCE(id.base_damage, v_unarmed_base),
         COALESCE(id.primary_damage_type, 'strike')
  INTO   v_char_weapon_name, v_char_weapon_base, v_char_dmg_type
  FROM   character_inventory ci
  JOIN   item_definitions id ON id.id = ci.item_id
  WHERE  ci.character_id = p_character_id AND ci.equipped_slot = 'weapon'
  LIMIT  1;

  v_char_weapon_base := COALESCE(v_char_weapon_base, v_unarmed_base);
  v_char_dmg_type    := COALESCE(v_char_dmg_type, 'strike');

  SELECT id.display_name, COALESCE(id.base_defense, 0)
  INTO   v_char_armor_name, v_char_armor_bonus
  FROM   character_inventory ci
  JOIN   item_definitions id ON id.id = ci.item_id
  WHERE  ci.character_id = p_character_id AND ci.equipped_slot = 'chest'
  LIMIT  1;

  v_char_armor_bonus := COALESCE(v_char_armor_bonus, 0);

  SELECT id.display_name,
         COALESCE(id.base_damage, v_unarmed_base),
         COALESCE(id.primary_damage_type, 'strike')
  INTO   v_opp_weapon_name, v_opp_weapon_base, v_opp_dmg_type
  FROM   character_inventory ci
  JOIN   item_definitions id ON id.id = ci.item_id
  WHERE  ci.character_id = v_opponent_id AND ci.equipped_slot = 'weapon'
  LIMIT  1;

  v_opp_weapon_base := COALESCE(v_opp_weapon_base, v_unarmed_base);
  v_opp_dmg_type    := COALESCE(v_opp_dmg_type, 'strike');

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

  v_char_raw := GREATEST(1.0, v_char_weapon_base::float * (1.0 + v_char_str::float / v_str_divisor::float));
  v_opp_raw  := GREATEST(1.0, v_opp_weapon_base::float  * (1.0 + v_opp_str::float  / v_str_divisor::float));

  v_char_deflect := (v_char_end::float * v_end_armor_factor::float + v_char_armor_bonus::float)
                    / (v_char_end::float * v_end_armor_factor::float + v_char_armor_bonus::float + v_armor_divisor::float);
  v_opp_deflect  := (v_opp_end::float  * v_end_armor_factor::float + v_opp_armor_bonus::float)
                    / (v_opp_end::float  * v_end_armor_factor::float + v_opp_armor_bonus::float  + v_armor_divisor::float);

  -- Higher DEX appears first in the log each round (cosmetic — damage is simultaneous)
  v_char_logs_first := (v_char_dex >= v_opp_dex);

  -- Simultaneous combat: both fighters deal damage each round before either dies
  WHILE v_char_hp > 0 AND v_opp_hp > 0 AND v_round <= v_max_rounds LOOP

    v_char_deflected := v_char_raw * v_opp_deflect;
    v_char_net       := GREATEST(1.0, v_char_raw - v_char_deflected);

    v_opp_deflected  := v_opp_raw * v_char_deflect;
    v_opp_net        := GREATEST(1.0, v_opp_raw - v_opp_deflected);

    v_opp_hp_new  := GREATEST(0.0, v_opp_hp  - v_char_net);
    v_char_hp_new := GREATEST(0.0, v_char_hp - v_opp_net);

    IF v_char_logs_first THEN
      v_combat_log := v_combat_log || jsonb_build_object(
        'n', v_log_n, 'attacker', v_char_name, 'defender', v_opp_name,
        'rawDamage', ROUND(v_char_raw::numeric, 1),
        'deflected', ROUND(v_char_deflected::numeric, 1),
        'netDamage', ROUND(v_char_net::numeric, 1),
        'type', v_char_dmg_type,
        'atkHp', ROUND(v_char_hp::numeric),
        'defHpBefore', ROUND(v_opp_hp::numeric),
        'defHpAfter', ROUND(v_opp_hp_new::numeric)
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
        'defHpAfter', ROUND(v_char_hp_new::numeric)
      );
    ELSE
      v_combat_log := v_combat_log || jsonb_build_object(
        'n', v_log_n, 'attacker', v_opp_name, 'defender', v_char_name,
        'rawDamage', ROUND(v_opp_raw::numeric, 1),
        'deflected', ROUND(v_opp_deflected::numeric, 1),
        'netDamage', ROUND(v_opp_net::numeric, 1),
        'type', v_opp_dmg_type,
        'atkHp', ROUND(v_opp_hp::numeric),
        'defHpBefore', ROUND(v_char_hp::numeric),
        'defHpAfter', ROUND(v_char_hp_new::numeric)
      );
      v_log_n := v_log_n + 1;
      v_combat_log := v_combat_log || jsonb_build_object(
        'n', v_log_n, 'attacker', v_char_name, 'defender', v_opp_name,
        'rawDamage', ROUND(v_char_raw::numeric, 1),
        'deflected', ROUND(v_char_deflected::numeric, 1),
        'netDamage', ROUND(v_char_net::numeric, 1),
        'type', v_char_dmg_type,
        'atkHp', ROUND(v_char_hp::numeric),
        'defHpBefore', ROUND(v_opp_hp::numeric),
        'defHpAfter', ROUND(v_opp_hp_new::numeric)
      );
    END IF;

    v_log_n := v_log_n + 1;
    v_round := v_round + 1;

    v_char_hp := v_char_hp_new;
    v_opp_hp  := v_opp_hp_new;
  END LOOP;

  -- Tiebreaker: both reach 0 HP in same round → higher DEX wins
  IF v_char_hp <= 0 AND v_opp_hp <= 0 THEN
    v_char_wins := (v_char_dex >= v_opp_dex);
  ELSE
    v_char_wins := v_char_hp > 0;
  END IF;

  v_winner_id        := CASE WHEN v_char_wins THEN p_character_id ELSE v_opponent_id END;
  v_char_delta       := CASE WHEN v_char_wins THEN 30 ELSE -10 END;
  v_opp_delta        := CASE WHEN v_char_wins THEN -10 ELSE 30 END;
  v_combat_starts_at := now() + interval '5 seconds';

  v_char_fighter_data := jsonb_build_object(
    'str', v_char_str, 'end', v_char_end, 'dex', v_char_dex, 'vig', v_char_vigor,
    'weaponName', v_char_weapon_name, 'damageType', v_char_dmg_type,
    'weaponBase', v_char_weapon_base, 'armorName', v_char_armor_name,
    'armorBonus', v_char_armor_bonus
  );
  v_opp_fighter_data := jsonb_build_object(
    'str', v_opp_str, 'end', v_opp_end, 'dex', v_opp_dex, 'vig', v_opp_vigor,
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
