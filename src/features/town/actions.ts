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

export type ArenaCombatResult = {
  matched: true;
  won: boolean;
  yourName: string;
  opponentName: string;
  yourMaxHp: number;
  opponentMaxHp: number;
  ratingDelta: number;
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

  const { data: match, error } = await supabase
    .from('arena_matches')
    .select('winner_id, player1_id, player2_id, player1_rating_delta, player2_rating_delta, combat_log')
    .or(`player1_id.eq.${characterId},player2_id.eq.${characterId}`)
    .gt('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!match) return { matched: false };

  const opponentId = match.player1_id === characterId ? match.player2_id : match.player1_id;
  const ratingDelta = match.player1_id === characterId
    ? match.player1_rating_delta
    : match.player2_rating_delta;

  // Fetch both names and vigor (for max HP) in parallel
  const [charResult, oppResult] = await Promise.all([
    supabase.from('characters').select('name').eq('id', characterId).single(),
    supabase.from('characters').select('name').eq('id', opponentId).single(),
  ]);
  const [attrResult, oppAttrResult] = await Promise.all([
    supabase.from('character_attributes').select('vigor').eq('character_id', characterId).single(),
    supabase.from('character_attributes').select('vigor').eq('character_id', opponentId).single(),
  ]);

  const yourName = charResult.data?.name ?? 'You';
  const opponentName = oppResult.data?.name ?? 'Opponent';
  const yourMaxHp = 50 + (attrResult.data?.vigor ?? 5) * 15;
  const opponentMaxHp = 50 + (oppAttrResult.data?.vigor ?? 5) * 15;

  return {
    matched: true,
    won: match.winner_id === characterId,
    yourName,
    opponentName,
    yourMaxHp,
    opponentMaxHp,
    ratingDelta: ratingDelta ?? (match.winner_id === characterId ? 30 : -10),
    combatLog: (match.combat_log ?? []) as CombatStrike[],
  };
}
