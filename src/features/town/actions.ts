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

export async function joinArenaQueue(characterId: string): Promise<{ matched: boolean; won?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data, error } = await supabase.rpc('join_arena_queue', {
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);

  return data as { matched: boolean; won?: boolean };
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
 * Does NOT call revalidatePath to avoid triggering a full page re-render on
 * every poll interval — we only update local client state on match found.
 */
export async function checkArenaMatch(
  characterId: string,
  since: string,
): Promise<{ matched: true; won: boolean } | { matched: false }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data, error } = await supabase
    .from('arena_matches')
    .select('winner_id, player1_id, player2_id')
    .or(`player1_id.eq.${characterId},player2_id.eq.${characterId}`)
    .gt('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { matched: false };

  return { matched: true, won: data.winner_id === characterId };
}
