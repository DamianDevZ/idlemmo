-- ─── World Boss Functions ─────────────────────────────────────────────────────
-- Adds attack cooldown tracking + lazy state transitions + join/attack RPCs.

-- Track last attack time per participant for the 30s cooldown
alter table public.world_boss_participants
  add column if not exists last_attack_at timestamptz;

-- ── ensure_world_boss ─────────────────────────────────────────────────────────
-- Lazily transitions boss states and creates a new boss when none is active.
-- Called on every page load — idempotent and safe to call frequently.
create or replace function public.ensure_world_boss()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biome_tier_id uuid;
  v_active_count  int;
  v_boss_names    text[] := array[
    'Ancient Treant', 'Stone Colossus', 'Shadow Lurker',
    'Swamp Titan', 'Desert Wyrm', 'Frost Colossus',
    'Volcanic Drake', 'Corrupted Sentinel'
  ];
begin
  -- Lazy transition: scheduled → queuing when spawns_at has passed
  update world_bosses
  set status = 'queuing'
  where status = 'scheduled' and spawns_at <= now();

  -- Lazy transition: queuing → in_progress when queue window closed
  update world_bosses
  set status = 'in_progress', started_at = now()
  where status = 'queuing' and queue_closes_at <= now();

  -- Check if any boss is still active after transitions
  select count(*) into v_active_count
  from world_bosses
  where status in ('queuing', 'in_progress');

  if v_active_count > 0 then
    return; -- Active boss exists, nothing to do
  end if;

  -- Pick a random tier-1 biome tier for the next boss
  select bt.id into v_biome_tier_id
  from biome_tiers bt
  join biomes b on b.id = bt.biome_id
  where bt.tier = 1
  order by random()
  limit 1;

  if v_biome_tier_id is null then
    return; -- No biome tiers seeded yet
  end if;

  -- Spawn a new boss in queuing state (10-minute queue window before combat starts)
  insert into world_bosses (biome_tier_id, name, max_hp, current_hp, status, spawns_at, queue_closes_at)
  values (
    v_biome_tier_id,
    v_boss_names[floor(random() * array_length(v_boss_names, 1))::int + 1],
    500,
    500,
    'queuing',
    now(),
    now() + interval '10 minutes'
  );
end;
$$;

-- ── join_world_boss ───────────────────────────────────────────────────────────
-- Adds the character to the boss fight. Accepted during queuing or in_progress.
-- Idempotent: calling again after joining is a no-op.
create or replace function public.join_world_boss(p_boss_id uuid, p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boss_status text;
begin
  -- Verify the character belongs to the calling user
  if not exists (
    select 1 from characters where id = p_character_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  select status into v_boss_status from world_bosses where id = p_boss_id;
  if v_boss_status is null then
    raise exception 'Boss not found';
  end if;
  if v_boss_status not in ('queuing', 'in_progress') then
    raise exception 'Boss is not accepting participants';
  end if;

  insert into world_boss_participants (boss_id, character_id, damage_dealt)
  values (p_boss_id, p_character_id, 0)
  on conflict (boss_id, character_id) do nothing;
end;
$$;

-- ── attack_world_boss ─────────────────────────────────────────────────────────
-- Deals one round of damage to the boss using the character's equipped weapon + strength.
-- Enforces a 30-second cooldown between attacks.
-- When the boss reaches 0 HP: marks it completed and distributes coin rewards proportionally.
create or replace function public.attack_world_boss(p_boss_id uuid, p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boss_hp       int;
  v_boss_max_hp   int;
  v_boss_status   text;
  v_last_attack   timestamptz;
  v_cooldown_secs int := 30;
  v_strength      int := 5;
  v_weapon_dmg    int := 5;
  v_damage        int;
  v_new_hp        int;
  v_is_kill       bool;
  v_total_dmg     bigint;
  v_coin_id       uuid;
  rec             record;
begin
  -- Verify ownership
  if not exists (
    select 1 from characters where id = p_character_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  -- Lock the boss row to prevent race conditions on HP updates
  select current_hp, max_hp, status
  into v_boss_hp, v_boss_max_hp, v_boss_status
  from world_bosses where id = p_boss_id for update;

  if v_boss_hp is null then raise exception 'Boss not found'; end if;
  if v_boss_status != 'in_progress' then raise exception 'Boss is not active'; end if;
  if v_boss_hp <= 0 then raise exception 'Boss is already defeated'; end if;

  -- Check participant + cooldown
  select last_attack_at into v_last_attack
  from world_boss_participants
  where boss_id = p_boss_id and character_id = p_character_id;

  if not found then
    raise exception 'You have not joined this boss fight';
  end if;

  if v_last_attack is not null
     and extract(epoch from (now() - v_last_attack)) < v_cooldown_secs then
    raise exception 'Attack on cooldown — wait % more seconds',
      ceil(v_cooldown_secs - extract(epoch from (now() - v_last_attack)))::int;
  end if;

  -- Resolve character strength
  select coalesce(strength, 5) into v_strength
  from character_attributes where character_id = p_character_id;
  if v_strength is null then v_strength := 5; end if;

  -- Resolve equipped weapon damage
  select coalesce((id_def.stats->>'weapon_damage')::int, 5) into v_weapon_dmg
  from character_inventory ci
  join item_definitions id_def on id_def.id = ci.item_id
  where ci.character_id = p_character_id
    and ci.equipped_slot = 'weapon'
  limit 1;
  if v_weapon_dmg is null then v_weapon_dmg := 5; end if;

  -- Damage formula mirrors actOnExploreEvent: weapon_dmg * (1 + str/20) ± 20%
  v_damage := greatest(1,
    round(v_weapon_dmg::float * (1.0 + v_strength::float / 20.0) * (0.8 + random() * 0.4))::int
  );

  v_new_hp := greatest(0, v_boss_hp - v_damage);
  v_is_kill := v_new_hp = 0;

  -- Apply damage to boss
  update world_bosses set current_hp = v_new_hp where id = p_boss_id;

  -- Update participant stats
  update world_boss_participants
  set damage_dealt = damage_dealt + v_damage,
      last_attack_at = now()
  where boss_id = p_boss_id and character_id = p_character_id;

  -- Boss defeated: mark completed and distribute coin rewards
  if v_is_kill then
    update world_bosses
    set status = 'completed', completed_at = now()
    where id = p_boss_id;

    select id into v_coin_id from item_definitions where name = 'coin' limit 1;

    select coalesce(sum(damage_dealt), 1) into v_total_dmg
    from world_boss_participants where boss_id = p_boss_id;

    -- Each participant receives 50 base coins + a proportional share of a 300-coin bonus.
    -- This rewards contribution without excluding low-damage participants.
    if v_coin_id is not null then
      for rec in (
        select character_id, damage_dealt
        from world_boss_participants
        where boss_id = p_boss_id
      ) loop
        insert into character_inventory (character_id, item_id, quantity)
        values (
          rec.character_id,
          v_coin_id,
          50 + round(300.0 * rec.damage_dealt::float / v_total_dmg::float)::int
        )
        on conflict (character_id, item_id)
        do update set quantity = character_inventory.quantity + excluded.quantity;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'damage',  v_damage,
    'new_hp',  v_new_hp,
    'max_hp',  v_boss_max_hp,
    'is_kill', v_is_kill
  );
end;
$$;
