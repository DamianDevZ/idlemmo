'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type EnemyFormData = {
  name: string;
  display_name: string;
  biome_id: string;
  tier: number;
  level: number;
  base_hp: number;
  base_attack: number;
  base_armor: number;
  base_speed: number;
  xp_reward: number;
  armor_preset_id: string;
  loot_table: object;
};

export async function upsertEnemy(id: string | null, data: EnemyFormData) {
  await requireAdmin();
  const db = createAdminClient();

  if (id) {
    const { error } = await db.from('enemy_types').update(data).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from('enemy_types').insert(data);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/admin/enemies');
}

export async function deleteEnemy(id: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('enemy_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/enemies');
}
