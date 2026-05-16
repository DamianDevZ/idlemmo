'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function joinWorldBoss(bossId: string, characterId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { error } = await supabase.rpc('join_world_boss', {
    p_boss_id: bossId,
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/game/town');
}

export async function attackWorldBoss(bossId: string, characterId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data, error } = await supabase.rpc('attack_world_boss', {
    p_boss_id: bossId,
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/game/town');
  return data as { damage: number; new_hp: number; max_hp: number; is_kill: boolean };
}

/**
 * Returns the total number of participants for a boss, bypassing RLS.
 * The world_boss_participants SELECT policy restricts to own character only,
 * so we use the admin client to get an accurate cross-player count.
 */
export async function getBossParticipantCount(bossId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('world_boss_participants')
    .select('*', { count: 'exact', head: true })
    .eq('boss_id', bossId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
