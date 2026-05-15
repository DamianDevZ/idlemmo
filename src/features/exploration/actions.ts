'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { GAME_CONFIG } from '@/config/game.config';
import { awardMainXp, awardCategoryXp } from '@/lib/game/xp';
import type { CollectPreference } from '@/types/game';

const { attributes: ATTR } = GAME_CONFIG;

export type ExploreAction = 'collect' | 'leave' | 'fight' | 'flee';

export interface ActOnEventResult {
  ok: boolean;
  autoRetreat?: boolean;
  combatResult?: {
    victory: boolean;
    hpLost: number;
    xpGained: number;
    newHp: number;
    fleeSuccess?: boolean;
  };
}

export interface StartExplorationInput {
  characterId: string;
  biomeTierId: string;
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
      biome_tier_id: input.biomeTierId,
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

  const { data: event } = await supabase
    .from('exploration_events')
    .select('*')
    .eq('id', eventId)
    .eq('character_id', characterId)
    .single();
  if (!event) throw new Error('Event not found');

  const d = (event.data ?? {}) as Record<string, unknown>;

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
      awardMainXp(supabase, characterId, itemTier * 8),
      awardCategoryXp(supabase, characterId, 'gathering', itemTier * 12),
    ]);
    return { ok: true };
  }

  if (action === 'leave') {
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
    // fight
    const enemyHp   = 10 + level * 4;
    const playerDmg = Math.max(1, 5 + Math.floor(Math.random() * 5));
    const enemyDmg  = Math.max(1, 2 + Math.floor(level * 1.5 * Math.random()));
    const rounds    = Math.ceil(enemyHp / playerDmg);
    hpLost  = Math.min(character.current_hp - 1, Math.floor(rounds * enemyDmg * 0.4));
    victory = playerDmg * rounds >= enemyHp;
    xpGained = victory ? 10 + level * 3 : 0;
  }

  const newHp = Math.max(1, character.current_hp - hpLost);

  if (hpLost > 0) {
    await supabase.from('characters').update({ current_hp: newHp }).eq('id', characterId);
  }

  // Award XP for combat — main XP and usage category
  if (victory && xpGained > 0) {
    await Promise.all([
      awardMainXp(supabase, characterId, xpGained),
      awardCategoryXp(supabase, characterId, 'usage', level * 10),
    ]);
  }

  // Insert a result event so it appears in history
  await supabase.from('exploration_events').insert({
    session_id:   sessionId,
    character_id: characterId,
    event_type:   action === 'flee' ? 'flee_result' : 'combat_result',
    data: action === 'flee'
      ? { enemy: d.enemy, fleeSuccess, hpLost, newHp }
      : { enemy: d.enemy, level, victory, hpLost, xpGained, newHp },
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
    return { ok: true, autoRetreat: true, combatResult: { victory, hpLost, xpGained, newHp, fleeSuccess } };
  }

  return { ok: true, combatResult: { victory, hpLost, xpGained, newHp, fleeSuccess } };
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
