'use server';

import { createClient } from '@/lib/supabase/server';

// ── Friends ───────────────────────────────────────────────────────────────────

export async function acceptFriendRequest(requestId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthenticated' };

    const { data: character } = await supabase
      .from('characters')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!character) return { error: 'Character not found' };

    const { error } = await supabase.rpc('accept_friend_request', {
      p_request_id:       requestId,
      p_to_character_id:  character.id,
    });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong' };
  }
}

export async function declineFriendRequest(requestId: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthenticated' };

    const { data: character } = await supabase
      .from('characters')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!character) return { error: 'Character not found' };

    const { error } = await supabase.rpc('decline_friend_request', {
      p_request_id:       requestId,
      p_to_character_id:  character.id,
    });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong' };
  }
}

export async function sendFriendRequest(targetName: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthenticated' };

    const { data: character } = await supabase
      .from('characters')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!character) return { error: 'Character not found' };

    const trimmed = targetName.trim();
    if (!trimmed) return { error: 'Enter a character name' };

    const { data: target } = await supabase
      .from('characters')
      .select('id')
      .ilike('name', trimmed)
      .maybeSingle();
    if (!target) return { error: `No adventurer named "${trimmed}" found` };
    if (target.id === character.id) return { error: "You can't add yourself" };

    const { error } = await supabase
      .from('friend_requests')
      .insert({ from_character_id: character.id, to_character_id: target.id });

    if (error) {
      if (error.code === '23505') return { error: 'Friend request already sent' };
      return { error: error.message };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong' };
  }
}

// ── Arena ────────────────────────────────────────────────────────────────────

export type CombatStrike = {
  n: number;
  attacker: string;
  defender: string;
  rawDamage: number;
  deflected: number;
  netDamage: number;
  type: string;
  atkHp: number;
  defHpBefore: number;
  defHpAfter: number;
};

export type FighterData = {
  str: number;
  end: number;
  dex: number;
  vig: number;
  weaponName: string | null;
  damageType: string;
  weaponBase: number;
  armorName: string | null;
  armorBonus: number;
};

export type ArenaCombatResult = {
  matched: true;
  won: boolean;
  yourName: string;
  opponentName: string;
  yourMaxHp: number;
  opponentMaxHp: number;
  ratingDelta: number;
  /** ISO timestamp: when the fight animation begins. Both players anchor to this. */
  combatStartsAt: string;
  yourFighterData: FighterData;
  opponentFighterData: FighterData;
  combatLog: CombatStrike[];
};

export async function joinArenaQueue(
  characterId: string,
): Promise<{ matched: false } | ArenaCombatResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data, error } = await supabase.rpc('join_arena_queue', {
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);

  return data as { matched: false } | ArenaCombatResult;
}

export async function leaveArenaQueue(characterId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { error } = await supabase.rpc('leave_arena_queue', {
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Polls for a completed arena match since the player joined the queue.
 * Fetches the full combat log so the waiting player gets the same dramatic
 * replay as the player who triggered the match via joinArenaQueue.
 */
export async function checkArenaMatch(
  characterId: string,
  since: string,
): Promise<{ matched: false } | ArenaCombatResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Fetch stored max HPs so both players see the exact same combat values —
  // the simulation ran once; we never re-derive stats from character_attributes here.
  const { data: match, error } = await supabase
    .from('arena_matches')
    .select(
      'winner_id, player1_id, player2_id, player1_rating_delta, player2_rating_delta, player1_max_hp, player2_max_hp, combat_starts_at, player1_fighter_data, player2_fighter_data, combat_log',
    )
    .or(`player1_id.eq.${characterId},player2_id.eq.${characterId}`)
    .gt('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!match) return { matched: false };

  const isPlayer1 = match.player1_id === characterId;
  const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
  const ratingDelta = isPlayer1 ? match.player1_rating_delta : match.player2_rating_delta;
  const yourMaxHp = isPlayer1 ? match.player1_max_hp : match.player2_max_hp;
  const opponentMaxHp = isPlayer1 ? match.player2_max_hp : match.player1_max_hp;
  const yourFighterData = isPlayer1 ? match.player1_fighter_data : match.player2_fighter_data;
  const opponentFighterData = isPlayer1 ? match.player2_fighter_data : match.player1_fighter_data;

  // Only need the two character names — everything else comes from the stored match
  const [charResult, oppResult] = await Promise.all([
    supabase.from('characters').select('name').eq('id', characterId).single(),
    supabase.from('characters').select('name').eq('id', opponentId).single(),
  ]);

  const defaultFighter: FighterData = { str: 5, end: 5, dex: 5, vig: 5, weaponName: null, damageType: 'strike', weaponBase: 25, armorName: null, armorBonus: 0 };

  return {
    matched: true,
    won: match.winner_id === characterId,
    yourName: charResult.data?.name ?? 'You',
    opponentName: oppResult.data?.name ?? 'Opponent',
    yourMaxHp: yourMaxHp ?? 125,
    opponentMaxHp: opponentMaxHp ?? 125,
    ratingDelta: ratingDelta ?? (match.winner_id === characterId ? 30 : -10),
    combatStartsAt: match.combat_starts_at ?? new Date(Date.now() + 5000).toISOString(),
    yourFighterData: (yourFighterData ?? defaultFighter) as FighterData,
    opponentFighterData: (opponentFighterData ?? defaultFighter) as FighterData,
    combatLog: (match.combat_log ?? []) as CombatStrike[],
  };
}
