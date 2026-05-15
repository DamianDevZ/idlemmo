'use server';

import { createClient } from '@/lib/supabase/server';
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
