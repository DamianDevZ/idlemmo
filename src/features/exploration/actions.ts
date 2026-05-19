'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getGameConfig } from '@/lib/game/getGameConfig';
import { awardMainXp, awardCategoryXp } from '@/lib/game/xp';
import { calcMeleeDamage, applyDefense } from '@/lib/game/formulas';
import type { CollectPreference } from '@/types/game';

export type ExploreAction = 'collect' | 'leave' | 'fight' | 'flee' | 'campsite_continue';

export interface ActOnEventResult {
  ok: boolean;
  autoRetreat?: boolean;
  combatResult?: {
    victory: boolean;
    hpLost: number;
    xpGained: number;
    newHp: number;
    fleeSuccess?: boolean;
    lootDrops?: Array<{ item: string; quantity: number }>;
  };
}

export interface StartExplorationInput {
  characterId: string;
  areaId: string;
  areaTier: number;
  endsAt?: string;          // ISO string, optional duration
  retreatHpThreshold?: number;
  collectPreferences?: Record<string, CollectPreference>;
}

/** Start a new exploration session. All validation is server-side. */
export async function startExploration(input: StartExplorationInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Validate ownership
  const { data: character } = await supabase
    .from('characters')
    .select('id, current_hp')
    .eq('id', input.characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');
  if (character.current_hp <= 0) throw new Error('Character has no HP — return home to rest');

  // Check no active session already exists
  const { data: existing } = await supabase
    .from('exploration_sessions')
    .select('id')
    .eq('character_id', input.characterId)
    .eq('status', 'active')
    .single();
  if (existing) throw new Error('Already exploring — return home first');

  // Validate retreat threshold range
  const retreatHp = Math.max(0, Math.min(100, input.retreatHpThreshold ?? 20));

  const { data: session, error } = await supabase
    .from('exploration_sessions')
    .insert({
      character_id: input.characterId,
      biome_tier_id: null,
      area_id: input.areaId,
      area_tier: input.areaTier,
      focus_type: 'balanced',
      ends_at: input.endsAt ?? null,
      retreat_hp_threshold: retreatHp,
      collect_preferences: input.collectPreferences ?? {},
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/game/explore');
  revalidatePath('/game');
  return session.id;
}

/** End an active exploration session and return home. Idempotent — safe to call even if already ended. */
export async function returnHome(characterId: string, _sessionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  // End ALL active sessions for this character — query by character_id+status so a
  // stale/wrong client-side session ID never leaves a session dangling in the DB.
  const { data: activeSessions } = await supabase
    .from('exploration_sessions')
    .update({ status: 'completed' })
    .eq('character_id', characterId)
    .eq('status', 'active')
    .select('id');

  // Insert session_ended event for each session we just closed
  if (activeSessions && activeSessions.length > 0) {
    await supabase.from('exploration_events').insert(
      activeSessions.map(s => ({
        session_id:   s.id,
        character_id: characterId,
        event_type:   'session_ended',
        data:         { reason: 'completed' },
      }))
    );
  }

  // Restore HP to max so player isn't stuck
  await supabase.rpc('restore_hp_on_return', { p_character_id: characterId });

  revalidatePath('/game/explore');
  revalidatePath('/game');
}

/**
 * Execute a player decision on a pending exploration event.
 * - collect / leave: for resource_found events
 * - fight / flee:    for enemy_encountered events
 */
export async function actOnExploreEvent(
  characterId: string,
  sessionId: string,
  eventId: string,
  action: ExploreAction,
): Promise<ActOnEventResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: character } = await supabase
    .from('characters')
    .select('id, current_hp, character_attributes(*)')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  // Fetch equipped weapon and armor for stat-based combat
  const { data: equippedItems } = await supabase
    .from('character_inventory')
    .select('equipped_slot, tier, item_definitions(type, base_damage, base_defense, attack_speed, primary_damage_type)')
    .eq('character_id', characterId)
    .not('equipped_slot', 'is', null);

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
  const equipped = (equippedItems ?? []) as unknown as EquippedItem[];
  const weaponDef     = equipped.find(e => e.item_definitions?.type === 'weapon')?.item_definitions;
  const armorDef      = equipped.find(e => e.item_definitions?.type === 'armor')?.item_definitions;
  let weaponDmgBase       = Number(weaponDef?.base_damage  ?? 5);
  let armorRating         = Number(armorDef?.base_defense  ?? 0);
  const weaponAttackSpeed = Number(weaponDef?.attack_speed ?? 1.0);
  const weaponDamageType  = weaponDef?.primary_damage_type ?? null;

  // Apply tier-scaling multipliers if equipped items are above T1
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

  const { data: event } = await supabase
    .from('exploration_events')
    .select('*')
    .eq('id', eventId)
    .eq('character_id', characterId)
    .single();
  if (!event) throw new Error('Event not found');

  const d = (event.data ?? {}) as Record<string, unknown>;
  const { attributes: ATTR, xpRewards: XP } = await getGameConfig();

  // ── Collect / Leave ────────────────────────────────────────────────────────
  if (action === 'collect') {
    await supabase.rpc('add_to_inventory', {
      p_character_id: characterId,
      p_item_name:    String(d.item),
      p_quantity:     Number(d.quantity),
    });
    // Award XP proportional to item tier
    const itemTier = Number(d.item_tier ?? 1);
    await Promise.all([
      awardMainXp(supabase, characterId, itemTier * XP.gatherMainXpPerTier),
      awardCategoryXp(supabase, characterId, 'gathering', itemTier * XP.gatherCatXpPerTier),
    ]);
    return { ok: true };
  }

  if (action === 'leave' || action === 'campsite_continue') {
    return { ok: true };
  }

  // ── Fight / Flee ───────────────────────────────────────────────────────────
  const { data: session } = await supabase
    .from('exploration_sessions')
    .select('id, retreat_hp_threshold')
    .eq('id', sessionId)
    .eq('character_id', characterId)
    .single();
  if (!session) throw new Error('No active session');

  const vigor  = (character.character_attributes as unknown as { vigor: number } | null)?.vigor ?? 5;
  const maxHp  = ATTR.baseHp + vigor * ATTR.hpPerVigor;
  const level  = Number(d.level ?? 1);

  let hpLost      = 0;
  let victory     = false;
  let xpGained    = 0;
  let fleeSuccess = false;

  if (action === 'flee') {
    fleeSuccess = Math.random() < 0.5;
    if (!fleeSuccess) {
      // Failed flee — take partial damage
      hpLost = Math.max(1, Math.floor(level * 2));
    }
  } else {
    // fight — use equipped weapon + strength via formulas.ts
    const attrs = character.character_attributes as unknown as { strength: number; vigor: number; dexterity: number } | null;
    const strength   = attrs?.strength   ?? 5;
    const dexterity  = attrs?.dexterity  ?? 5;

    // Use base_hp/base_attack from event data if set by new enemy system, else fall back to level formula
    const enemyHp      = Number(d.base_hp     ?? (10 + level * 4));
    const enemyAtkBase = Number(d.base_attack ?? (2 + level * 1.5));

    // Attack speed: weapon speed amplified by dexterity
    const effectiveAttackSpeed = weaponAttackSpeed * (1 + dexterity / ATTR.dexSpeedDivisor);
    const playerDmgBase = calcMeleeDamage(weaponDmgBase, strength, 0);
    let playerDmg = Math.max(1, playerDmgBase * effectiveAttackSpeed * (0.8 + Math.random() * 0.4));

    // Apply enemy damage-type resistances to the player's hit
    type ResistanceEntry = { value: number; mode: string };
    const enemyResistances = (d.resistances ?? {}) as Record<string, ResistanceEntry>;
    if (weaponDamageType && enemyResistances[weaponDamageType]) {
      const res = enemyResistances[weaponDamageType];
      if (res.mode === 'percent') playerDmg = Math.max(1, playerDmg * (1 - res.value / 100));
      else                        playerDmg = Math.max(1, playerDmg - res.value);
    }

    // Enemy deals raw damage reduced by player armor
    const enemyDmgRaw  = Math.max(1, enemyAtkBase * Math.random());
    const enemyDmg     = applyDefense(enemyDmgRaw, armorRating);
    const rounds    = Math.ceil(enemyHp / playerDmg);
    hpLost  = Math.min(character.current_hp - 1, Math.floor(rounds * enemyDmg * 0.4));
    victory = playerDmg * rounds >= enemyHp;
    // Prefer xp_reward stored in event data (from enemy_types), fall back to formula
    xpGained = victory ? Number(d.xp_reward ?? (XP.combatBaseXp + level * XP.combatXpPerLevel)) : 0;
  }

  // Roll loot drops from the enemy's loot_table stored in event data.
  // Each entry has a weight-out-of-10 drop chance (e.g. weight=8 → 80% to drop).
  type LootEntry = { item: string; min: number; max: number; weight: number };
  const lootTable = (d.loot_table as LootEntry[] | undefined) ?? [];
  const lootDrops: Array<{ item: string; quantity: number }> = [];

  if (victory && lootTable.length > 0) {
    for (const entry of lootTable) {
      if (Math.random() * 10 < entry.weight) {
        const qty = Math.floor(Math.random() * (entry.max - entry.min + 1)) + entry.min;
        await supabase.rpc('add_to_inventory', {
          p_character_id: characterId,
          p_item_name:    entry.item,
          p_quantity:     qty,
        });
        lootDrops.push({ item: entry.item, quantity: qty });
      }
    }
  }

  const newHp = Math.max(1, character.current_hp - hpLost);

  if (hpLost > 0) {
    await supabase.from('characters').update({ current_hp: newHp }).eq('id', characterId);
  }

  // Award XP for combat — main XP and usage category
  if (victory && xpGained > 0) {
    await Promise.all([
      awardMainXp(supabase, characterId, xpGained),
      awardCategoryXp(supabase, characterId, 'usage', level * XP.combatUsageCatXpPerLevel),
    ]);
  }

  // Insert a result event so it appears in history
  await supabase.from('exploration_events').insert({
    session_id:   sessionId,
    character_id: characterId,
    event_type:   action === 'flee' ? 'flee_result' : 'combat_result',
    data: action === 'flee'
      ? { enemy: d.enemy, fleeSuccess, hpLost, newHp }
      : { enemy: d.enemy, level, victory, hpLost, xpGained, newHp, lootDrops },
  });

  // Check auto-retreat threshold
  const hpPct = (newHp / maxHp) * 100;
  if (hpPct <= session.retreat_hp_threshold) {
    await supabase
      .from('exploration_sessions')
      .update({ status: 'completed' })
      .eq('id', session.id);
    await supabase.rpc('restore_hp_on_return', { p_character_id: characterId });
    await supabase.from('exploration_events').insert({
      session_id:   sessionId,
      character_id: characterId,
      event_type:   'session_ended',
      data:         { reason: 'auto_retreat', hp: newHp },
    });
    revalidatePath('/game');
    return { ok: true, autoRetreat: true, combatResult: { victory, hpLost, xpGained, newHp, fleeSuccess, lootDrops } };
  }

  return { ok: true, combatResult: { victory, hpLost, xpGained, newHp, fleeSuccess, lootDrops } };
}

/** Update collect preference for an item type in the active session. */
export async function updateCollectPreference(
  sessionId: string,
  characterId: string,
  itemId: string,
  preference: CollectPreference,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: session } = await supabase
    .from('exploration_sessions')
    .select('id, character_id, collect_preferences')
    .eq('id', sessionId)
    .eq('character_id', characterId)
    .single();
  if (!session) throw new Error('Session not found');

  // Verify ownership via character
  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Not authorised');

  const updated = { ...(session.collect_preferences as Record<string, string>), [itemId]: preference };

  await supabase
    .from('exploration_sessions')
    .update({ collect_preferences: updated })
    .eq('id', sessionId);

  revalidatePath('/game/explore');
}

/**
 * Use a consumable item from the character's inventory at a campsite.
 * Verifies ownership, applies the heal_amount from item stats, and
 * removes one unit from inventory. Returns the character's new HP.
 */
export async function useCampsiteItem(
  characterId: string,
  itemInstanceId: string,
): Promise<{ ok: boolean; newHp: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Verify character ownership
  const { data: character } = await supabase
    .from('characters')
    .select('id, current_hp, character_attributes(vigor)')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  // Verify the item belongs to this character and is a consumable
  const { data: invItem } = await supabase
    .from('character_inventory')
    .select('instance_id, quantity, item_definitions(type, consumable_effects)')
    .eq('instance_id', itemInstanceId)
    .eq('character_id', characterId)
    .single();
  if (!invItem) throw new Error('Item not found in inventory');

  type ConsumableEffect = { trigger: string; target: string; value: number };
  const itemDef = (invItem.item_definitions as unknown) as { type: string; consumable_effects?: ConsumableEffect[] } | null;
  if (itemDef?.type !== 'consumable') throw new Error('Item is not a consumable');

  const healEffect = (itemDef.consumable_effects ?? []).find(e => e.target === 'hp' && e.value > 0);
  const healAmount = healEffect?.value ?? 0;
  if (healAmount <= 0) throw new Error('Item has no heal effect');

  // Calculate max HP from vigor
  const vigor = ((character.character_attributes as unknown as { vigor?: number } | null)?.vigor ?? 5);
  const { attributes: ATTR } = await getGameConfig();
  const maxHp = ATTR.baseHp + vigor * ATTR.hpPerVigor;

  const newHp = Math.min(maxHp, character.current_hp + healAmount);

  // Apply heal and consume item in a transaction-like sequence
  await supabase
    .from('characters')
    .update({ current_hp: newHp })
    .eq('id', characterId);

  if (invItem.quantity <= 1) {
    await supabase.from('character_inventory').delete().eq('instance_id', itemInstanceId);
  } else {
    await supabase
      .from('character_inventory')
      .update({ quantity: invItem.quantity - 1 })
      .eq('instance_id', itemInstanceId);
  }

  return { ok: true, newHp };
}

/**
 * Fetches the character's current inventory for display during exploration.
 * Only returns items for the authenticated user's character.
 */
export async function getExploreInventory(characterId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Verify ownership
  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  const { data: items } = await supabase
    .from('character_inventory')
    .select('instance_id, quantity, equipped_slot, item_definitions(name, display_name, type, image_url, stackable)')
    .eq('character_id', characterId)
    .order('item_definitions(type)');

  return (items ?? []) as unknown as Array<{
    instance_id: string;
    quantity: number;
    equipped_slot: string | null;
    item_definitions: {
      name: string;
      display_name: string;
      type: string;
      image_url: string | null;
      stackable: boolean;
    } | null;
  }>;
}
