'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

// ─── New enemies system (enemies + enemy_tier_loot) ───────────────────────────

export async function upsertEnemyDef(
  id: string | null,
  data: {
    name: string;
    display_name: string;
    description: string;
    icon: string;
    sort_order: number;
    damage_type: string;
    attack_speed: number;
    base_hp: number;
    base_attack: number;
    resistances: Record<string, { value: number; mode: string }>;
  }
): Promise<string> {
  await requireAdmin();
  const db = createAdminClient();
  if (id) {
    const { error } = await db.from('enemies').update(data).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/enemies');
    return id;
  }
  const { data: row, error } = await db.from('enemies').insert(data).select('id').single();
  if (error || !row) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath('/admin/enemies');
  return row.id;
}

export async function deleteEnemyDef(id: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('enemies').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/enemies');
}

export async function upsertEnemyTierLoot(row: {
  id?: string;
  enemy_id: string;
  tier: number;
  item_id: string;
  item_tier: number | null;
  weight: number;
}): Promise<string> {
  await requireAdmin();
  const db = createAdminClient();
  const { id, ...rest } = row;
  if (id) {
    const { error } = await db.from('enemy_tier_loot').update(rest).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath(`/admin/enemies/${rest.enemy_id}`);
    return id;
  }
  const { data, error } = await db.from('enemy_tier_loot').insert(rest).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath(`/admin/enemies/${rest.enemy_id}`);
  return data.id;
}

export async function deleteEnemyTierLoot(id: string, enemyId: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('enemy_tier_loot').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/enemies/${enemyId}`);
}

