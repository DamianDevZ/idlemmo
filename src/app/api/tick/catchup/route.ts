import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGameConfig } from '@/lib/game/getGameConfig';
import { pickGrade } from '@/lib/game/pickGrade';
import { awardMainXp, awardCategoryXp, getCategoryXpRates } from '@/lib/game/xp';
import { calcMeleeDamage, applyDefense, actionXpForTier } from '@/lib/game/formulas';
import { recordItemDiscovery } from '@/lib/game/discovery';

export interface OfflineSummary {
  ticksProcessed: number;
  resourcesGained: Array<{ item: string; displayName: string; quantity: number }>;
  lootGained: Array<{ item: string; quantity: number }>;
  equipmentGained: Array<{ item: string; grade: string }>;
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

    const { exploration: EXP, attributes: ATTR, gradeWeights, gradeMultipliers } = await getGameConfig();

    // Verify ownership and get character stats
    const { data: character } = await supabase
      .from('characters')
      .select('id, current_hp, character_attributes(*)')
      .eq('id', characterId)
      .eq('user_id', user.id)
      .single();
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cap offline ticks to the character's endurance-derived limit (base 10 + 1 per 2 endurance)
    const endurance = (character.character_attributes as unknown as { endurance: number } | null)?.endurance ?? 0;
    const MAX_OFFLINE_TICKS = 10 + Math.floor(endurance / 2);

    const { data: session } = await supabase
      .from('exploration_sessions')
      .select('*')
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

    // All sessions now use the area system (biome system removed)
    const sessionAreaId: string | null = (session as { area_id?: string | null }).area_id ?? null;
    const sessionAreaTier: number = (session as { area_tier?: number | null }).area_tier ?? 1;
    if (!sessionAreaId) return NextResponse.json({ error: 'Legacy session not supported' }, { status: 400 });
    const isAreaSession = true;
    const isRuins = false;

    // Fetch simulation inputs in parallel — one round-trip for everything
    const [
      areaLootResult,
      areaEnemiesResult,
      equippedResult,
    ] = await Promise.all([
      supabase
          .from('area_tier_loot')
          .select('weight, quantity_min, quantity_max, item_definitions(name, display_name)')
          .eq('area_id', sessionAreaId)
          .eq('tier', sessionAreaTier),

      supabase
          .from('area_tier_enemies')
          .select('weight, enemies(display_name, base_hp, base_attack, resistances, enemy_tier_loot(weight, item_definitions(name, type, grade_weights)))')
          .eq('area_id', sessionAreaId)
          .eq('tier', sessionAreaTier),

      supabase
        .from('character_inventory')
        .select('equipped_slot, tier, item_rating, item_definitions(type, base_damage, base_defense, attack_speed, primary_damage_type)')
        .eq('character_id', characterId)
        .not('equipped_slot', 'is', null),
    ]);

    // Resolve equipped weapon + armor for offline combat
    type EquippedItem = {
      equipped_slot: string | null;
      tier: number;
      item_rating: string | null;
      item_definitions: {
        type: string;
        base_damage: number | null;
        base_defense: number | null;
        attack_speed: number | null;
        primary_damage_type: string | null;
      } | null;
    };
    const equipped = (equippedResult.data ?? []) as unknown as EquippedItem[];
    const weaponEquipped = equipped.find(e => e.item_definitions?.type === 'weapon');
    const weaponDef = weaponEquipped?.item_definitions;
    const armorDef  = equipped.find(e => e.item_definitions?.type === 'armor')?.item_definitions;
    let weaponDmgBase       = Number(weaponDef?.base_damage  ?? 5);
    let armorRating         = Number(armorDef?.base_defense  ?? 0);
    const weaponAttackSpeed = Number(weaponDef?.attack_speed ?? 1.0);
    const weaponDamageType  = weaponDef?.primary_damage_type ?? null;
    const weaponGrade       = (weaponEquipped?.item_rating ?? 'F') as keyof typeof gradeMultipliers;
    const weaponGradeMult   = gradeMultipliers[weaponGrade] ?? 1.0;

    // Apply tier-scaling multipliers for weapon/armor above T1
    const weaponTier = weaponEquipped?.tier ?? 1;
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
    type ItemDefLoot = { name: string; type: string; grade_weights: Record<string, number> | null } | null;
    type AreaEnemyRow = {
      weight: number;
      enemies: {
        display_name: string; base_hp: number; base_attack: number;
        resistances: Record<string, ResistanceEntry> | null;
        enemy_tier_loot: Array<{ weight: number; item_definitions: ItemDefLoot }>;
      } | null;
    };
    const areaEnemies = (areaEnemiesResult.data ?? []) as unknown as AreaEnemyRow[];

    const collectPrefs = (session.collect_preferences ?? {}) as Record<string, string>;
    const retreatThreshold = session.retreat_hp_threshold ?? 20;

    const resourceAccum: Record<string, { displayName: string; quantity: number }> = {};
    const lootAccum: Record<string, number> = {};
    // Equipment drops: one entry per individual instance so each gets its own grade
    const equipmentDrops: Array<{ itemName: string; gradeWeights: Record<string, number> | null }> = [];
    let coinsGained = 0;
    let enemiesKilled = 0;
    let totalXpGained = 0;
    let totalHpLost = 0;
    let sessionEnded = false;
    let ticksProcessed = 0;

    // Event weights — area-based sessions only
    const rChance = 0.65;
    const eChance = 0.20;
    const tChance = 0.07;
    const total   = rChance + eChance + tChance;

    for (let tick = 0; tick < pendingTicks; tick++) {
      ticksProcessed++;

      const roll = Math.random() * total;
      const eventType =
        roll < rChance              ? 'resource'
        : roll < rChance + eChance  ? 'enemy'
        : 'treasure';

      if (eventType === 'resource') {
        if (areaLoot.length > 0) {
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
        }
      } else if (eventType === 'enemy') {
        if (areaEnemies.length > 0) {
          // ── Area enemy ──────────────────────────────────────────────────
          const totalW = areaEnemies.reduce((s, r) => s + r.weight, 0);
          let w = Math.random() * totalW;
          const row = areaEnemies.find(r => { w -= r.weight; return w <= 0; }) ?? areaEnemies[0];
          const enemy = row.enemies;
          if (enemy) {
            const level = sessionAreaTier * 3;
            const enemyHp      = Number(enemy.base_hp      ?? (10 + level * 4));
            const enemyAtkBase = Number(enemy.base_attack  ?? (2  + level * 1.5));

            const playerDmgBase = calcMeleeDamage(weaponDmgBase, strength, 0, weaponGradeMult);
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
                  const def = lootEntry.item_definitions;
                  if (!def?.name) continue;
                  if (['weapon', 'armor', 'tool'].includes(def.type)) {
                    equipmentDrops.push({ itemName: def.name, gradeWeights: def.grade_weights });
                  } else {
                    lootAccum[def.name] = (lootAccum[def.name] ?? 0) + 1;
                  }
                }
              }
            } else {
              const hpLost = Math.min(currentHp - 1, Math.floor(rounds * enemyDmg * 0.4));
              currentHp   = Math.max(1, currentHp - hpLost);
              totalHpLost += hpLost;
              if ((currentHp / maxHp) * 100 <= retreatThreshold) { sessionEnded = true; break; }
            }
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
    // Equipment drops each need their own inventory row with a random grade
    const equipmentDropsWithGrades = equipmentDrops.map(d => ({
      ...d,
      grade: pickGrade(gradeWeights, d.gradeWeights),
    }));
    for (const drop of equipmentDropsWithGrades) {
      writes.push(
        supabase.rpc('add_to_inventory', {
          p_character_id: characterId,
          p_item_name:    drop.itemName,
          p_quantity:     1,
          p_item_rating:  drop.grade,
        })
      );
    }
    if (coinsGained > 0) {
      writes.push(
        supabase.rpc('add_to_inventory', { p_character_id: characterId, p_item_name: 'coin', p_quantity: coinsGained })
      );
    }
    const resourceQty = Object.values(resourceAccum).reduce((s, r) => s + r.quantity, 0);
    if (totalXpGained > 0 || resourceQty > 0) {
      const catRates = await getCategoryXpRates(supabase);
      if (totalXpGained > 0) {
        writes.push(awardMainXp(supabase, characterId, totalXpGained));
        writes.push(awardCategoryXp(supabase, characterId, 'weapon_mastery', Math.round(totalXpGained * (catRates.base.get('weapon_mastery') ?? 0.5))));
        writes.push(awardCategoryXp(supabase, characterId, 'armor_mastery',  Math.round(totalXpGained * (catRates.base.get('armor_mastery')  ?? 0.5))));
      }
      if (resourceQty > 0) {
        // Use session tier as proxy for item tier in catchup (no per-item tier available)
        writes.push(awardCategoryXp(supabase, characterId, 'tool_mastery', resourceQty * actionXpForTier(catRates.base.get('tool_mastery') ?? 2, catRates.earnedScaling.get('tool_mastery') ?? 1.5, sessionAreaTier)));
      }
    }
    if (totalHpLost > 0) {
      writes.push(supabase.from('characters').update({ current_hp: currentHp }).eq('id', characterId));
    }

    await Promise.all(writes);

    // Record discovery for all items that entered inventory this catchup batch
    const discoveredNames = [
      ...Object.keys(resourceAccum),
      ...Object.keys(lootAccum),
      ...equipmentDropsWithGrades.map(d => d.itemName),
    ];
    if (discoveredNames.length > 0) {
      await recordItemDiscovery(supabase, characterId, discoveredNames);
    }

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
      equipmentGained: equipmentDropsWithGrades.map(d => ({ item: d.itemName, grade: d.grade })),
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
