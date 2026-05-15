-- Migration 009: Arena matchmaking + friend decline function
-- Depends on: 006_social, 007_pvp

-- ─── Arena: join queue and attempt matchmaking ────────────────────────────────
-- Security definer so it can bypass RLS to delete opponent's queue entry,
-- insert arena_matches, and update both players' ratings in one atomic call.
create or replace function public.join_arena_queue(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level         int;
  v_current_hp    int;
  v_opponent_id   uuid;
  v_char_strength int;
  v_char_vigor    int;
  v_opp_strength  int;
  v_opp_vigor     int;
  v_char_max_hp   int;
  v_opp_max_hp    int;
  v_char_dmg      float;
  v_opp_dmg       float;
  v_char_rounds   int;
  v_opp_rounds    int;
  v_char_wins     bool;
  v_winner_id     uuid;
  v_char_delta    int;
  v_opp_delta     int;
  v_match_id      uuid;
begin
  -- Verify character belongs to the calling user
  if not exists (
    select 1 from characters
    where id = p_character_id and user_id = auth.uid()
  ) then
    raise exception 'Character not found or not yours';
  end if;

  -- Get character info
  select main_level, current_hp
  into v_level, v_current_hp
  from characters where id = p_character_id;

  if v_current_hp <= 0 then
    raise exception 'Restore HP before entering the arena';
  end if;

  -- Upsert into queue (refresh expiry if already waiting)
  insert into arena_queue (character_id, main_level, queued_at, expires_at)
  values (p_character_id, v_level, now(), now() + interval '2 minutes')
  on conflict (character_id) do update set
    main_level = excluded.main_level,
    queued_at  = now(),
    expires_at = now() + interval '2 minutes';

  -- Look for the longest-waiting opponent within level range
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

  -- Remove both from queue before creating the match
  delete from arena_queue where character_id in (p_character_id, v_opponent_id);

  -- Fetch attributes for combat simulation
  select coalesce(strength, 5), coalesce(vigor, 5)
  into v_char_strength, v_char_vigor
  from character_attributes where character_id = p_character_id;

  select coalesce(strength, 5), coalesce(vigor, 5)
  into v_opp_strength, v_opp_vigor
  from character_attributes where character_id = v_opponent_id;

  -- Simple round-based combat: base weapon_damage = 5, boosted by strength
  -- Mirrors calcMeleeDamage(5, strength, 0) from formulas.ts
  v_char_max_hp   := 100 + v_char_vigor * 10;
  v_opp_max_hp    := 100 + v_opp_vigor  * 10;
  v_char_dmg      := greatest(1, 5.0 * (1.0 + v_char_strength::float / 50.0));
  v_opp_dmg       := greatest(1, 5.0 * (1.0 + v_opp_strength::float  / 50.0));
  v_char_rounds   := ceil(v_opp_max_hp::float / v_char_dmg);
  v_opp_rounds    := ceil(v_char_max_hp::float / v_opp_dmg);
  v_char_wins     := v_char_rounds <= v_opp_rounds;
  v_winner_id     := case when v_char_wins then p_character_id else v_opponent_id end;
  v_char_delta    := case when v_char_wins then 30 else -10 end;
  v_opp_delta     := case when v_char_wins then -10 else 30 end;

  -- Record the match
  insert into arena_matches (
    player1_id, player2_id, winner_id,
    status, completed_at,
    player1_rating_delta, player2_rating_delta,
    combat_log
  ) values (
    p_character_id, v_opponent_id, v_winner_id,
    'completed', now(),
    v_char_delta, v_opp_delta,
    jsonb_build_array(jsonb_build_object(
      'char_dmg', v_char_dmg, 'opp_dmg', v_opp_dmg,
      'char_rounds', v_char_rounds, 'opp_rounds', v_opp_rounds
    ))
  )
  returning id into v_match_id;

  -- Upsert ratings for both players
  insert into arena_ratings (character_id, rating, wins, losses)
  values (p_character_id, greatest(0, 1000 + v_char_delta),
          case when v_char_wins then 1 else 0 end,
          case when v_char_wins then 0 else 1 end)
  on conflict (character_id) do update set
    rating  = greatest(0, arena_ratings.rating + v_char_delta),
    wins    = arena_ratings.wins   + case when v_char_wins then 1 else 0 end,
    losses  = arena_ratings.losses + case when v_char_wins then 0 else 1 end;

  insert into arena_ratings (character_id, rating, wins, losses)
  values (v_opponent_id, greatest(0, 1000 + v_opp_delta),
          case when not v_char_wins then 1 else 0 end,
          case when not v_char_wins then 0 else 1 end)
  on conflict (character_id) do update set
    rating  = greatest(0, arena_ratings.rating + v_opp_delta),
    wins    = arena_ratings.wins   + case when not v_char_wins then 1 else 0 end,
    losses  = arena_ratings.losses + case when not v_char_wins then 0 else 1 end;

  return jsonb_build_object(
    'matched',   true,
    'won',       v_char_wins,
    'match_id',  v_match_id
  );
end;
$$;

-- ─── Arena: leave queue ────────────────────────────────────────────────────────
create or replace function public.leave_arena_queue(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from characters where id = p_character_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  delete from arena_queue where character_id = p_character_id;
end;
$$;

-- ─── Friends: decline a request ───────────────────────────────────────────────
-- The existing accept_friend_request already uses SECURITY INVOKER which is fine
-- since the to_character_id check is inside the function. We add a parallel
-- decline function that marks the request as declined.
create or replace function public.decline_friend_request(p_request_id uuid, p_to_character_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.friend_requests
  set status = 'declined'
  where id = p_request_id
    and to_character_id = p_to_character_id
    and status = 'pending';

  if not found then
    raise exception 'Friend request not found or already actioned';
  end if;
end;
$$;
