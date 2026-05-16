-- Rebuild join_arena_queue to produce a round-by-round combat log.
-- Uses game-config-accurate formulas:
--   maxHp  = 50 + vigor * 15
--   rawDmg = 25 * (1 + strength / 20)       [25 = arena weapon base]
--   armor  = endurance * 5
--   deflectionPct = armor / (armor + 100)    [armorDivisor = 100]
--   netDmg = max(1, rawDmg * (1 - deflectionPct))
--   initiative: higher dexterity strikes first (tie → challenger goes first)

create or replace function public.join_arena_queue(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level           int;
  v_current_hp      int;
  v_opponent_id     uuid;

  v_char_name       text;
  v_opp_name        text;
  v_char_str        int;
  v_char_vigor      int;
  v_char_end        int;
  v_char_dex        int;
  v_opp_str         int;
  v_opp_vigor       int;
  v_opp_end         int;
  v_opp_dex         int;

  v_char_max_hp     int;
  v_opp_max_hp      int;
  v_char_hp         float;
  v_opp_hp          float;

  v_char_raw        float;
  v_opp_raw         float;
  v_char_armor      float;
  v_opp_armor       float;
  v_char_deflect    float;  -- fraction 0..1
  v_opp_deflect     float;

  v_char_goes_first bool;
  v_attacker        text;
  v_defender        text;
  v_raw             float;
  v_deflect_pct     float;
  v_deflected_amt   float;
  v_net             float;
  v_atk_hp          float;
  v_def_hp_before   float;

  v_combat_log      jsonb := '[]'::jsonb;
  v_attack_num      int   := 1;

  v_char_wins       bool;
  v_winner_id       uuid;
  v_char_delta      int;
  v_opp_delta       int;
  v_match_id        uuid;
begin
  -- ── Auth check ──────────────────────────────────────────────────────────────
  if not exists (
    select 1 from characters
    where id = p_character_id and user_id = auth.uid()
  ) then
    raise exception 'Character not found or not yours';
  end if;

  select main_level, current_hp, name
  into v_level, v_current_hp, v_char_name
  from characters where id = p_character_id;

  if v_current_hp <= 0 then
    raise exception 'Restore HP before entering the arena';
  end if;

  -- ── Queue upsert ────────────────────────────────────────────────────────────
  insert into arena_queue (character_id, main_level, queued_at, expires_at)
  values (p_character_id, v_level, now(), now() + interval '2 minutes')
  on conflict (character_id) do update set
    main_level = excluded.main_level,
    queued_at  = now(),
    expires_at = now() + interval '2 minutes';

  -- ── Find opponent ───────────────────────────────────────────────────────────
  select aq.character_id
  into v_opponent_id
  from arena_queue aq
  where aq.character_id != p_character_id
    and aq.main_level between v_level - 5 and v_level + 5
    and aq.expires_at > now()
  order by aq.queued_at
  limit 1;

  if v_opponent_id is null then
    return jsonb_build_object('matched', false);
  end if;

  delete from arena_queue where character_id in (p_character_id, v_opponent_id);

  -- ── Load stats ──────────────────────────────────────────────────────────────
  select name into v_opp_name from characters where id = v_opponent_id;

  select coalesce(strength,5), coalesce(vigor,5), coalesce(endurance,5), coalesce(dexterity,5)
  into   v_char_str, v_char_vigor, v_char_end, v_char_dex
  from character_attributes where character_id = p_character_id;

  select coalesce(strength,5), coalesce(vigor,5), coalesce(endurance,5), coalesce(dexterity,5)
  into   v_opp_str, v_opp_vigor, v_opp_end, v_opp_dex
  from character_attributes where character_id = v_opponent_id;

  -- ── Derived combat values ───────────────────────────────────────────────────
  v_char_max_hp  := 50 + v_char_vigor * 15;
  v_opp_max_hp   := 50 + v_opp_vigor  * 15;
  v_char_hp      := v_char_max_hp;
  v_opp_hp       := v_opp_max_hp;

  v_char_raw     := greatest(1.0, 25.0 * (1.0 + v_char_str::float / 20.0));
  v_opp_raw      := greatest(1.0, 25.0 * (1.0 + v_opp_str::float  / 20.0));

  -- deflect fraction: armor / (armor + 100)
  v_char_armor   := v_char_end::float * 5.0;
  v_opp_armor    := v_opp_end::float  * 5.0;
  v_char_deflect := v_char_armor / (v_char_armor + 100.0);
  v_opp_deflect  := v_opp_armor  / (v_opp_armor  + 100.0);

  -- Higher dex goes first; tie → challenger (p_character_id) leads
  v_char_goes_first := (v_char_dex >= v_opp_dex);

  -- ── Round-by-round simulation (max 50 attacks) ──────────────────────────────
  while v_char_hp > 0 and v_opp_hp > 0 and v_attack_num <= 50 loop
    -- Alternate attacker: odd attacks go to whoever goes first
    if (v_char_goes_first and v_attack_num % 2 = 1)
    or (not v_char_goes_first and v_attack_num % 2 = 0) then
      -- Character attacks opponent
      v_attacker      := v_char_name;
      v_defender      := v_opp_name;
      v_raw           := v_char_raw;
      v_deflect_pct   := v_opp_deflect;
      v_atk_hp        := v_char_hp;
      v_def_hp_before := v_opp_hp;
      v_deflected_amt := v_raw * v_deflect_pct;
      v_net           := greatest(1.0, v_raw - v_deflected_amt);
      v_opp_hp        := greatest(0.0, v_opp_hp - v_net);
      v_combat_log    := v_combat_log || jsonb_build_object(
        'n',           v_attack_num,
        'attacker',    v_attacker,
        'defender',    v_defender,
        'rawDamage',   round(v_raw::numeric, 1),
        'deflected',   round(v_deflected_amt::numeric, 1),
        'netDamage',   round(v_net::numeric, 1),
        'type',        'Melee',
        'atkHp',       round(v_atk_hp::numeric),
        'defHpBefore', round(v_def_hp_before::numeric),
        'defHpAfter',  round(v_opp_hp::numeric)
      );
    else
      -- Opponent attacks character
      v_attacker      := v_opp_name;
      v_defender      := v_char_name;
      v_raw           := v_opp_raw;
      v_deflect_pct   := v_char_deflect;
      v_atk_hp        := v_opp_hp;
      v_def_hp_before := v_char_hp;
      v_deflected_amt := v_raw * v_deflect_pct;
      v_net           := greatest(1.0, v_raw - v_deflected_amt);
      v_char_hp       := greatest(0.0, v_char_hp - v_net);
      v_combat_log    := v_combat_log || jsonb_build_object(
        'n',           v_attack_num,
        'attacker',    v_attacker,
        'defender',    v_defender,
        'rawDamage',   round(v_raw::numeric, 1),
        'deflected',   round(v_deflected_amt::numeric, 1),
        'netDamage',   round(v_net::numeric, 1),
        'type',        'Melee',
        'atkHp',       round(v_atk_hp::numeric),
        'defHpBefore', round(v_def_hp_before::numeric),
        'defHpAfter',  round(v_char_hp::numeric)
      );
    end if;

    v_attack_num := v_attack_num + 1;
  end loop;

  -- ── Determine winner & rating deltas ────────────────────────────────────────
  v_char_wins := v_char_hp > 0;
  v_winner_id := case when v_char_wins then p_character_id else v_opponent_id end;
  v_char_delta := case when v_char_wins then 30 else -10 end;
  v_opp_delta  := case when v_char_wins then -10 else 30 end;

  -- ── Record match ────────────────────────────────────────────────────────────
  insert into arena_matches (
    player1_id, player2_id, winner_id,
    status, completed_at,
    player1_rating_delta, player2_rating_delta,
    combat_log
  ) values (
    p_character_id, v_opponent_id, v_winner_id,
    'completed', now(),
    v_char_delta, v_opp_delta,
    v_combat_log
  )
  returning id into v_match_id;

  -- ── Upsert ratings ──────────────────────────────────────────────────────────
  insert into arena_ratings (character_id, rating, wins, losses)
  values (p_character_id,
          greatest(0, 1000 + v_char_delta),
          case when v_char_wins then 1 else 0 end,
          case when v_char_wins then 0 else 1 end)
  on conflict (character_id) do update set
    rating  = greatest(0, arena_ratings.rating + v_char_delta),
    wins    = arena_ratings.wins   + case when v_char_wins then 1 else 0 end,
    losses  = arena_ratings.losses + case when v_char_wins then 0 else 1 end;

  insert into arena_ratings (character_id, rating, wins, losses)
  values (v_opponent_id,
          greatest(0, 1000 + v_opp_delta),
          case when not v_char_wins then 1 else 0 end,
          case when not v_char_wins then 0 else 1 end)
  on conflict (character_id) do update set
    rating  = greatest(0, arena_ratings.rating + v_opp_delta),
    wins    = arena_ratings.wins   + case when not v_char_wins then 1 else 0 end,
    losses  = arena_ratings.losses + case when not v_char_wins then 0 else 1 end;

  -- ── Return full result ──────────────────────────────────────────────────────
  return jsonb_build_object(
    'matched',       true,
    'won',           v_char_wins,
    'yourName',      v_char_name,
    'opponentName',  v_opp_name,
    'yourMaxHp',     v_char_max_hp,
    'opponentMaxHp', v_opp_max_hp,
    'ratingDelta',   v_char_delta,
    'combatLog',     v_combat_log
  );
end;
$$;
