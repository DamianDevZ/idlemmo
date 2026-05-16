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
  // Don't revalidate — WorldBossPanel manages HP state client-side via realtime
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

/**
 * Returns live boss HP and status along with participant count.
 * Used to poll for updates when the realtime subscription is unavailable
 * (world_bosses may not yet be in the supabase_realtime publication).
 */
export async function getBossCurrentState(bossId: string): Promise<{
  current_hp: number;
  status: string;
  participantCount: number;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const admin = createAdminClient();
  const [{ data: boss, error: bossErr }, { count }] = await Promise.all([
    supabase
      .from('world_bosses')
      .select('current_hp, status')
      .eq('id', bossId)
      .single(),
    admin
      .from('world_boss_participants')
      .select('*', { count: 'exact', head: true })
      .eq('boss_id', bossId),
  ]);

  if (bossErr || !boss) throw new Error('Boss not found');
  return { current_hp: boss.current_hp, status: boss.status, participantCount: count ?? 0 };
}
