import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGameConfig } from '@/lib/game/getGameConfig';
import { awardMainXp, awardCategoryXp } from '@/lib/game/xp';
import { calcMeleeDamage, applyDefense } from '@/lib/game/formulas';

export interface OfflineSummary {
  ticksProcessed: number;
  resourcesGained: Array<{ item: string; displayName: string; quantity: number }>;
  lootGained: Array<{ item: string; quantity: number }>;
  enemiesKilled: number;
  coinsGained: number;
  xpGained: number;
  hpLost: number;
  sessionEnded: boolean;
}

/**
 * POST /api/tick/catchup
 * Body: { characterId: string }
 *
 * Batch-processes all ticks that accumulated while the client was offline.
 * Resources, enemies, and treasure are auto-resolved using the character's current stats.
 * Returns a summary of everything that happened so the client can show a recap.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const body = await req.json() as { characterId?: string };
    const { characterId } = body;
    if (!characterId) return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });

    const { exploration: EXP, attributes: ATTR } = await getGameConfig();
    const MAX_OFFLINE_TICKS = Math.ceil((2 * 60 * 60 * 1000) / (EXP.tickIntervalSeconds * 1000));

    // Verify ownership and get character stats
    const { data: character } = await supabase
      .from('characters')
      .select('id, current_hp, character_attributes(*)')
      .eq('id', characterId)
      .eq('user_id', user.id)
      .single();
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: session } = await supabase
      .from('exploration_sessions')
      .select('*, biome_tiers(*, biomes(*))')
      .eq('character_id', characterId)
      .eq('status', 'active')
      .single();
    if (!session) return NextResponse.json({ error: 'No active session' }, { status: 404 });

    // Determine how many ticks are pending
    const intervalMs = EXP.tickIntervalSeconds * 1000;
    const elapsed = Date.now() - new Date(session.last_tick_at).getTime();
    const pendingTicks = Math.min(MAX_OFFLINE_TICKS, Math.floor(elapsed / intervalMs));

    // Fewer than 2 pending ticks — let the normal cycle handle it
    if (pendingTicks < 2) {
      return NextResponse.json({ processed: 0, summary: null });
    }

    // Detect area vs legacy session
    const isAreaSession = !!(session as { area_id?: string | null }).area_id;
    const sessionAreaId: string | null = (session as { area_id?: string | null }).area_id ?? null;
    const sessionAreaTier: number = (session as { area_tier?: number | null }).area_tier ?? 1;

    const biomeTier = isAreaSession ? null : (session.biome_tiers as {
      tier: number;
      enemy_level_min: number;
      enemy_level_max: number;
      biomes?: { id: string; name: string };
    } | null);
    const biomeTierNumber = isAreaSession ? sessionAreaTier : (biomeTier?.tier ?? 1);
    const biomeName = isAreaSession ? '' : (biomeTier?.biomes?.name ?? '');
    const biomeId   = isAreaSession ? null : (biomeTier?.biomes?.id ?? null);
    const isRuins   = biomeName === 'ruins';

    // Fetch simulation inputs in parallel — one round-trip for everything
    const [
      areaLootResult,
      areaEnemiesResult,
      biomeResourcesResult,
      legacyEnemyTypesResult,
      equippedResult,
    ] = await Promise.all([
      isAreaSession
        ? supabase
            .from('area_tier_loot')
            .select('weight, quantity_min, quantity_max, item_definitions(name, display_name)')
            .eq('area_id', sessionAreaId!)
            .eq('tier', sessionAreaTier)
        : Promise.resolve({ data: null }),

      isAreaSession
        ? supabase
            .from('area_tier_enemies')
            .select('weight, enemies(display_name, base_hp, base_attack, resistances, enemy_tier_loot(weight, item_definitions(name)))')
            .eq('area_id', sessionAreaId!)
            .eq('tier', sessionAreaTier)
        : Promise.resolve({ data: null }),

      !isAreaSession
        ? supabase
            .from('biome_tier_resources')
            .select('item_name, base_yield_min, base_yield_max, spawn_weight')
            .eq('biome_tier_id', session.biome_tier_id)
        : Promise.resolve({ data: null }),

      !isAreaSession && biomeId
        ? supabase
            .from('enemy_types')
            .select('display_name, level, xp_reward, loot_table')
            .eq('tier', biomeTierNumber)
            .eq('biome_id', biomeId)
        : Promise.resolve({ data: [] }),

      supabase
        .from('character_inventory')
        .select('equipped_slot, tier, item_definitions(type, base_damage, base_defense, attack_speed, primary_damage_type)')
        .eq('character_id', characterId)
        .not('equipped_slot', 'is', null),
    ]);

    // Resolve equipped weapon + armor for offline combat
    type EquippedItem = {
      equipped_slot: string | null;
      tier: number;
      item_definitions: {
        type: string;
        base_damage: number | null;
        base_defense: number | null;
        attack_speed: number | null;
        primary_damage_type: string | null;
      } | null;
    };
    const equipped = (equippedResult.data ?? []) as unknown as EquippedItem[];
    const weaponDef = equipped.find(e => e.item_definitions?.type === 'weapon')?.item_definitions;
    const armorDef  = equipped.find(e => e.item_definitions?.type === 'armor')?.item_definitions;
    let weaponDmgBase       = Number(weaponDef?.base_damage  ?? 5);
    let armorRating         = Number(armorDef?.base_defense  ?? 0);
    const weaponAttackSpeed = Number(weaponDef?.attack_speed ?? 1.0);
    const weaponDamageType  = weaponDef?.primary_damage_type ?? null;

    // Apply tier-scaling multipliers for weapon/armor above T1
    const weaponTier = equipped.find(e => e.item_definitions?.type === 'weapon')?.tier ?? 1;
    const armorTier  = equipped.find(e => e.item_definitions?.type === 'armor')?.tier  ?? 1;
    if (weaponTier > 1 || armorTier > 1) {
      const tiersNeeded = [...new Set([weaponTier > 1 ? weaponTier : 0, armorTier > 1 ? armorTier : 0].filter(t => t > 0))];
      const { data: scalingRows } = await supabase
        .from('tier_scaling_config')
        .select('item_type, stat_key, tier, multiplier')
        .in('tier', tiersNeeded)
        .in('item_type', ['weapon', 'armor']);
      const mult = (type: string, key: string, tier: number) =>
        Number(scalingRows?.find(r => r.item_type === type && r.stat_key === key && r.tier === tier)?.multiplier ?? 1.0);
      if (weaponTier > 1) weaponDmgBase *= mult('weapon', 'base_damage', weaponTier);
      if (armorTier  > 1) armorRating  *= mult('armor',  'base_defense', armorTier);
    }

    const attrs = character.character_attributes as unknown as { strength: number; vigor: number; dexterity: number } | null;
    const strength   = attrs?.strength   ?? 5;
    const vigor      = attrs?.vigor      ?? 5;
    const dexterity  = attrs?.dexterity  ?? 5;
    const maxHp = ATTR.baseHp + vigor * ATTR.hpPerVigor;
    const effectiveAttackSpeed = weaponAttackSpeed * (1 + dexterity / ATTR.dexSpeedDivisor);
    let currentHp = character.current_hp;

    // Typed area data
    type AreaLootRow = {
      weight: number; quantity_min: number; quantity_max: number;
      item_definitions: { name: string; display_name: string } | null;
    };
    const areaLoot = (areaLootResult.data ?? []) as unknown as AreaLootRow[];

    type ResistanceEntry = { value: number; mode: string };
    type AreaEnemyRow = {
      weight: number;
      enemies: {
        display_name: string; base_hp: number; base_attack: number;
        resistances: Record<string, ResistanceEntry> | null;
        enemy_tier_loot: Array<{ weight: number; item_definitions: { name: string } | null }>;
      } | null;
    };
    const areaEnemies = (areaEnemiesResult.data ?? []) as unknown as AreaEnemyRow[];

    type LootEntry = { item: string; min: number; max: number; weight: number };
    type EnemyType = { display_name: string; level: number; xp_reward: number; loot_table: LootEntry[] };
    const legacyEnemies = ((legacyEnemyTypesResult as { data: unknown[] | null }).data ?? []) as EnemyType[];
    type BiomeResource = { item_name: string; base_yield_min: number; base_yield_max: number; spawn_weight: number };
    const biomeResources = ((biomeResourcesResult as { data: unknown[] | null }).data ?? []) as BiomeResource[];

    const collectPrefs = (session.collect_preferences ?? {}) as Record<string, string>;
    const retreatThreshold = session.retreat_hp_threshold ?? 20;

    // Accumulators — aggregate by item name to minimise DB writes
    const resourceAccum: Record<string, { displayName: string; quantity: number }> = {};
    const lootAccum: Record<string, number> = {};
    let coinsGained = 0;
    let enemiesKilled = 0;
    let totalXpGained = 0;
    let totalHpLost = 0;
    let sessionEnded = false;
    let ticksProcessed = 0;

    // Same event weights as /api/tick
    const rChance = isRuins ? 0.00 : 0.65;
    const eChance = isRuins ? 0.70 : 0.20;
    const tChance = isRuins ? 0.15 : 0.07;
    const total   = rChance + eChance + tChance;

    for (let tick = 0; tick < pendingTicks; tick++) {
      ticksProcessed++;

      const roll = Math.random() * total;
      const eventType =
        roll < rChance              ? 'resource'
        : roll < rChance + eChance  ? 'enemy'
        : 'treasure';

      if (eventType === 'resource') {
        if (isAreaSession && areaLoot.length > 0) {
          const totalW = areaLoot.reduce((s, r) => s + r.weight, 0);
          let w = Math.random() * totalW;
          const picked = areaLoot.find(r => { w -= r.weight; return w <= 0; }) ?? areaLoot[0];
          const itemName = picked.item_definitions?.name;
          if (itemName) {
            const pref = collectPrefs[itemName] ?? 'always';
            if (pref !== 'never') {
              const qty = Math.round(Math.random() * (picked.quantity_max - picked.quantity_min) + picked.quantity_min);
              const prev = resourceAccum[itemName];
              resourceAccum[itemName] = {
                displayName: picked.item_definitions?.display_name ?? itemName,
                quantity: (prev?.quantity ?? 0) + qty,
              };
            }
          }
        } else if (!isAreaSession && biomeResources.length > 0) {
          const totalW = biomeResources.reduce((s, r) => s + (r.spawn_weight ?? 10), 0);
          let w = Math.random() * totalW;
          const picked = biomeResources.find(r => { w -= r.spawn_weight ?? 10; return w <= 0; }) ?? biomeResources[0];
          const pref = collectPrefs[picked.item_name] ?? 'always';
          if (pref !== 'never') {
            const qty = Math.round(Math.random() * (picked.base_yield_max - picked.base_yield_min) + picked.base_yield_min);
            const prev = resourceAccum[picked.item_name];
            resourceAccum[picked.item_name] = {
              displayName: prev?.displayName ?? picked.item_name.replace(/_/g, ' '),
              quantity: (prev?.quantity ?? 0) + qty,
            };
          }
        }
      } else if (eventType === 'enemy') {
        if (isAreaSession && areaEnemies.length > 0) {
          // ── Area enemy ──────────────────────────────────────────────────
          const totalW = areaEnemies.reduce((s, r) => s + r.weight, 0);
          let w = Math.random() * totalW;
          const row = areaEnemies.find(r => { w -= r.weight; return w <= 0; }) ?? areaEnemies[0];
          const enemy = row.enemies;
          if (enemy) {
            const level = sessionAreaTier * 3;
            const enemyHp      = Number(enemy.base_hp      ?? (10 + level * 4));
            const enemyAtkBase = Number(enemy.base_attack  ?? (2  + level * 1.5));

            const playerDmgBase = calcMeleeDamage(weaponDmgBase, strength, 0);
            let playerDmg = Math.max(1, playerDmgBase * effectiveAttackSpeed * (0.8 + Math.random() * 0.4));

            // Apply resistance
            const resistances = (enemy.resistances ?? {}) as Record<string, ResistanceEntry>;
            if (weaponDamageType && resistances[weaponDamageType]) {
              const res = resistances[weaponDamageType];
              if (res.mode === 'percent') playerDmg = Math.max(1, playerDmg * (1 - res.value / 100));
              else                        playerDmg = Math.max(1, playerDmg - res.value);
            }

            const enemyDmgRaw = Math.max(1, enemyAtkBase * (0.5 + Math.random() * 0.5));
            const enemyDmg    = applyDefense(enemyDmgRaw, armorRating);
            const rounds      = Math.ceil(enemyHp / Math.max(0.1, playerDmg));
            const victory     = playerDmg * rounds >= enemyHp;

            if (victory) {
              enemiesKilled++;
              totalXpGained += 10 + level * 3;
              for (const lootEntry of (enemy.enemy_tier_loot ?? [])) {
                if (Math.random() * 10 < lootEntry.weight) {
                  const name = lootEntry.item_definitions?.name;
                  if (name) lootAccum[name] = (lootAccum[name] ?? 0) + 1;
                }
              }
            } else {
              const hpLost = Math.min(currentHp - 1, Math.floor(rounds * enemyDmg * 0.4));
              currentHp   = Math.max(1, currentHp - hpLost);
              totalHpLost += hpLost;
              if ((currentHp / maxHp) * 100 <= retreatThreshold) { sessionEnded = true; break; }
            }
          }
        } else if (!isAreaSession) {
          // ── Legacy biome enemy ───────────────────────────────────────────
          const pickedEnemy = legacyEnemies.length > 0
            ? legacyEnemies[Math.floor(Math.random() * legacyEnemies.length)]
            : null;
          const level = pickedEnemy?.level ?? (
            Math.floor(Math.random() * ((biomeTier?.enemy_level_max ?? 5) - (biomeTier?.enemy_level_min ?? 1) + 1))
            + (biomeTier?.enemy_level_min ?? 1)
          );

          // Simulate the same combat math used in actOnExploreEvent
          const enemyHp       = 10 + level * 4;
          const playerDmgBase = calcMeleeDamage(weaponDmgBase, strength, 0);
          const playerDmg     = Math.max(1, playerDmgBase * (0.8 + Math.random() * 0.4));
          const enemyDmgRaw   = Math.max(1, 2 + level * 1.5 * Math.random());
          const enemyDmg      = applyDefense(enemyDmgRaw, armorRating);
          const rounds        = Math.ceil(enemyHp / playerDmg);
          const victory       = playerDmg * rounds >= enemyHp;

          if (victory) {
            enemiesKilled++;
            totalXpGained += Number(pickedEnemy?.xp_reward ?? (10 + level * 3));
            for (const entry of (pickedEnemy?.loot_table ?? [])) {
              if (Math.random() * 10 < entry.weight) {
                const qty = Math.floor(Math.random() * (entry.max - entry.min + 1)) + entry.min;
                lootAccum[entry.item] = (lootAccum[entry.item] ?? 0) + qty;
              }
            }
          } else {
            const hpLost = Math.min(currentHp - 1, Math.floor(rounds * enemyDmg * 0.4));
            currentHp   = Math.max(1, currentHp - hpLost);
            totalHpLost += hpLost;
            if ((currentHp / maxHp) * 100 <= retreatThreshold) { sessionEnded = true; break; }
          }
        }
      } else {
        // treasure_found
        coinsGained += Math.floor(Math.random() * 25) + 5;
      }
    }

    // ── Write all accumulated results to the DB ──────────────────────────────
    // Use PromiseLike to accommodate both Promise (awardXp) and PostgrestFilterBuilder (rpc).
    const writes: PromiseLike<unknown>[] = [];

    for (const [itemName, { quantity }] of Object.entries(resourceAccum)) {
      writes.push(
        supabase.rpc('add_to_inventory', { p_character_id: characterId, p_item_name: itemName, p_quantity: quantity })
      );
    }
    for (const [itemName, quantity] of Object.entries(lootAccum)) {
      writes.push(
        supabase.rpc('add_to_inventory', { p_character_id: characterId, p_item_name: itemName, p_quantity: quantity })
      );
    }
    if (coinsGained > 0) {
      writes.push(
        supabase.rpc('add_to_inventory', { p_character_id: characterId, p_item_name: 'coin', p_quantity: coinsGained })
      );
    }
    if (totalXpGained > 0) {
      writes.push(awardMainXp(supabase, characterId, totalXpGained));
      writes.push(awardCategoryXp(supabase, characterId, 'usage', totalXpGained));
    }
    const resourceQty = Object.values(resourceAccum).reduce((s, r) => s + r.quantity, 0);
    if (resourceQty > 0) {
      writes.push(awardCategoryXp(supabase, characterId, 'gathering', resourceQty * 2));
    }
    if (totalHpLost > 0) {
      writes.push(supabase.from('characters').update({ current_hp: currentHp }).eq('id', characterId));
    }

    await Promise.all(writes);

    if (sessionEnded) {
      await supabase.from('exploration_sessions').update({ status: 'completed' }).eq('id', session.id);
      await supabase.rpc('restore_hp_on_return', { p_character_id: characterId });
    } else {
      await supabase
        .from('exploration_sessions')
        .update({ last_tick_at: new Date().toISOString() })
        .eq('id', session.id);
    }

    const summary: OfflineSummary = {
      ticksProcessed,
      resourcesGained: Object.entries(resourceAccum).map(([item, { displayName, quantity }]) => ({
        item, displayName, quantity,
      })),
      lootGained: Object.entries(lootAccum).map(([item, quantity]) => ({ item, quantity })),
      enemiesKilled,
      coinsGained,
      xpGained: totalXpGained,
      hpLost: totalHpLost,
      sessionEnded,
    };

    return NextResponse.json({ processed: ticksProcessed, summary });
  } catch (err: unknown) {
    console.error('[tick/catchup]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
