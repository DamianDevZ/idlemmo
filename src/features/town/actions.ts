'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ── Friends ───────────────────────────────────────────────────────────────────

export async function acceptFriendRequest(requestId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  const { error } = await supabase.rpc('accept_friend_request', {
    p_request_id:       requestId,
    p_to_character_id:  character.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/game/town');
}

export async function declineFriendRequest(requestId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  const { error } = await supabase.rpc('decline_friend_request', {
    p_request_id:       requestId,
    p_to_character_id:  character.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/game/town');
}

export async function sendFriendRequest(targetName: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  const trimmed = targetName.trim();
  if (!trimmed) throw new Error('Enter a character name');

  const { data: target } = await supabase
    .from('characters')
    .select('id')
    .ilike('name', trimmed)
    .single();
  if (!target) throw new Error(`No adventurer named "${trimmed}" found`);
  if (target.id === character.id) throw new Error("You can't add yourself");

  const { error } = await supabase
    .from('friend_requests')
    .insert({ from_character_id: character.id, to_character_id: target.id });

  if (error) {
    if (error.code === '23505') throw new Error('Friend request already sent');
    throw new Error(error.message);
  }

  revalidatePath('/game/town');
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

  revalidatePath('/game/town');
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

  revalidatePath('/game/town');
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
