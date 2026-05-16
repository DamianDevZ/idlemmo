-- Store fighter loadout snapshot at match time so the UI can display each
-- player's stats, weapon, armor, and damage type without re-querying live data.
-- Also fixes damage type in combat log: was hardcoded 'Melee', now uses actual
-- weapon primary_damage_type (slash, blunt, pierce, fire, ice, lightning, etc.)

ALTER TABLE arena_matches
  ADD COLUMN IF NOT EXISTS player1_fighter_data jsonb,
  ADD COLUMN IF NOT EXISTS player2_fighter_data jsonb;

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

  -- Weapon / armor for each fighter
  v_char_weapon_name  text;
  v_char_weapon_base  float := 25.0;
  v_char_dmg_type     text  := 'strike';
  v_char_armor_name   text;
  v_char_armor_bonus  float := 0.0;
  v_opp_weapon_name   text;
  v_opp_weapon_base   float := 25.0;
  v_opp_dmg_type      text  := 'strike';
  v_opp_armor_name    text;
  v_opp_armor_bonus   float := 0.0;

  v_char_max_hp     int;
  v_opp_max_hp      int;
  v_char_hp         float;
  v_opp_hp          float;

  v_char_raw        float;
  v_opp_raw         float;
  v_char_deflect    float;
  v_opp_deflect     float;

  v_attacker        text;
  v_defender        text;
  v_raw             float;
  v_deflect_pct     float;
  v_deflected_amt   float;
  v_net             float;
  v_atk_hp          float;
  v_def_hp_before   float;
  v_current_dmg_type text;

  v_combat_log      jsonb := '[]'::jsonb;
  v_attack_num      int   := 1;
  v_char_goes_first bool;

  v_char_wins        bool;
  v_winner_id        uuid;
  v_char_delta       int;
  v_opp_delta        int;
  v_match_id         uuid;
  v_combat_starts_at timestamptz;
  v_char_fighter_data jsonb;
  v_opp_fighter_data  jsonb;
begin
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

  insert into arena_queue (character_id, main_level, queued_at, expires_at)
  values (p_character_id, v_level, now(), now() + interval '2 minutes')
  on conflict (character_id) do update set
    main_level = excluded.main_level,
    queued_at  = now(),
    expires_at = now() + interval '2 minutes';

  select aq.character_id
  into v_opponent_id
  from arena_queue aq
  where aq.character_id != p_character_id
    and aq.main_level between v_level - 5 and v_level + 5
    and aq.expires_at > now()
  order by aq.queued_at
  limit 1
  for update skip locked;

  if v_opponent_id is null then
    return jsonb_build_object('matched', false);
  end if;

  delete from arena_queue where character_id in (p_character_id, v_opponent_id);

  select name into v_opp_name from characters where id = v_opponent_id;

  -- Load base attributes
  select coalesce(strength,5), coalesce(vigor,5), coalesce(endurance,5), coalesce(dexterity,5)
  into   v_char_str, v_char_vigor, v_char_end, v_char_dex
  from character_attributes where character_id = p_character_id;

  select coalesce(strength,5), coalesce(vigor,5), coalesce(endurance,5), coalesce(dexterity,5)
  into   v_opp_str, v_opp_vigor, v_opp_end, v_opp_dex
  from character_attributes where character_id = v_opponent_id;

  -- Load equipped weapon for the calling character
  select
    id.display_name,
    coalesce(id.base_damage, 25),
    coalesce(id.primary_damage_type, 'strike')
  into v_char_weapon_name, v_char_weapon_base, v_char_dmg_type
  from character_inventory ci
  join item_definitions id on id.id = ci.item_id
  where ci.character_id = p_character_id
    and ci.equipped_slot = 'weapon'
  limit 1;

  -- Load equipped armor (chest slot) for the calling character
  select id.display_name, coalesce(id.base_defense, 0)
  into v_char_armor_name, v_char_armor_bonus
  from character_inventory ci
  join item_definitions id on id.id = ci.item_id
  where ci.character_id = p_character_id
    and ci.equipped_slot = 'chest'
  limit 1;

  -- Load equipped weapon for opponent
  select
    id.display_name,
    coalesce(id.base_damage, 25),
    coalesce(id.primary_damage_type, 'strike')
  into v_opp_weapon_name, v_opp_weapon_base, v_opp_dmg_type
  from character_inventory ci
  join item_definitions id on id.id = ci.item_id
  where ci.character_id = v_opponent_id
    and ci.equipped_slot = 'weapon'
  limit 1;

  -- Load equipped armor for opponent
  select id.display_name, coalesce(id.base_defense, 0)
  into v_opp_armor_name, v_opp_armor_bonus
  from character_inventory ci
  join item_definitions id on id.id = ci.item_id
  where ci.character_id = v_opponent_id
    and ci.equipped_slot = 'chest'
  limit 1;

  v_char_max_hp  := 50 + v_char_vigor * 15;
  v_opp_max_hp   := 50 + v_opp_vigor  * 15;
  v_char_hp      := v_char_max_hp;
  v_opp_hp       := v_opp_max_hp;

  -- Weapon base_damage scaled by STR; unarmed falls back to 25 base
  v_char_raw     := greatest(1.0, v_char_weapon_base * (1.0 + v_char_str::float / 20.0));
  v_opp_raw      := greatest(1.0, v_opp_weapon_base  * (1.0 + v_opp_str::float  / 20.0));

  -- Deflection = armor bonus (endurance * 5 + flat armor) vs incoming damage
  v_char_deflect := (v_char_end::float * 5.0 + v_char_armor_bonus) /
                    (v_char_end::float * 5.0 + v_char_armor_bonus + 100.0);
  v_opp_deflect  := (v_opp_end::float  * 5.0 + v_opp_armor_bonus) /
                    (v_opp_end::float  * 5.0 + v_opp_armor_bonus  + 100.0);

  v_char_goes_first := (v_char_dex >= v_opp_dex);

  while v_char_hp > 0 and v_opp_hp > 0 and v_attack_num <= 50 loop
    if (v_char_goes_first and v_attack_num % 2 = 1)
    or (not v_char_goes_first and v_attack_num % 2 = 0) then
      v_attacker         := v_char_name;
      v_defender         := v_opp_name;
      v_raw              := v_char_raw;
      v_deflect_pct      := v_opp_deflect;
      v_current_dmg_type := v_char_dmg_type;
      v_atk_hp           := v_char_hp;
      v_def_hp_before    := v_opp_hp;
      v_deflected_amt    := v_raw * v_deflect_pct;
      v_net              := greatest(1.0, v_raw - v_deflected_amt);
      v_opp_hp           := greatest(0.0, v_opp_hp - v_net);
    else
      v_attacker         := v_opp_name;
      v_defender         := v_char_name;
      v_raw              := v_opp_raw;
      v_deflect_pct      := v_char_deflect;
      v_current_dmg_type := v_opp_dmg_type;
      v_atk_hp           := v_opp_hp;
      v_def_hp_before    := v_char_hp;
      v_deflected_amt    := v_raw * v_deflect_pct;
      v_net              := greatest(1.0, v_raw - v_deflected_amt);
      v_char_hp          := greatest(0.0, v_char_hp - v_net);
    end if;

    v_combat_log := v_combat_log || jsonb_build_object(
      'n',           v_attack_num,
      'attacker',    v_attacker,
      'defender',    v_defender,
      'rawDamage',   round(v_raw::numeric, 1),
      'deflected',   round(v_deflected_amt::numeric, 1),
      'netDamage',   round(v_net::numeric, 1),
      'type',        v_current_dmg_type,
      'atkHp',       round(v_atk_hp::numeric),
      'defHpBefore', round(v_def_hp_before::numeric),
      'defHpAfter',  case
                       when v_attacker = v_char_name then round(v_opp_hp::numeric)
                       else round(v_char_hp::numeric)
                     end
    );

    v_attack_num := v_attack_num + 1;
  end loop;

  v_char_wins    := v_char_hp > 0;
  v_winner_id    := case when v_char_wins then p_character_id else v_opponent_id end;
  v_char_delta   := case when v_char_wins then 30 else -10 end;
  v_opp_delta    := case when v_char_wins then -10 else 30 end;
  v_combat_starts_at := now() + interval '5 seconds';

  -- Snapshot fighter loadouts for both players
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

  insert into arena_matches (
    player1_id, player2_id, winner_id,
    status, completed_at,
    player1_rating_delta, player2_rating_delta,
    player1_max_hp, player2_max_hp,
    combat_starts_at,
    player1_fighter_data, player2_fighter_data,
    combat_log
  ) values (
    p_character_id, v_opponent_id, v_winner_id,
    'completed', now(),
    v_char_delta, v_opp_delta,
    v_char_max_hp, v_opp_max_hp,
    v_combat_starts_at,
    v_char_fighter_data, v_opp_fighter_data,
    v_combat_log
  )
  returning id into v_match_id;

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

  return jsonb_build_object(
    'matched',            true,
    'won',                v_char_wins,
    'yourName',           v_char_name,
    'opponentName',       v_opp_name,
    'yourMaxHp',          v_char_max_hp,
    'opponentMaxHp',      v_opp_max_hp,
    'ratingDelta',        v_char_delta,
    'combatStartsAt',     v_combat_starts_at,
    'yourFighterData',    v_char_fighter_data,
    'opponentFighterData', v_opp_fighter_data,
    'combatLog',          v_combat_log
  );
end;
$$;
