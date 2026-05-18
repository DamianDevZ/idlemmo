'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type EnemyLootRow = {
  id?: string;
  item_id: string;
  weight: number;
  quantity_min: number;
  quantity_max: number;
};

export type EnemyFormData = {
  name: string;
  display_name: string;
  area_id: string | null;
  biome_id: string;
  tier: number;
  level: number;
  base_hp: number;
  base_attack: number;
  base_armor: number;
  base_speed: number;
  xp_reward: number;
  armor_preset_id: string;
};

/** Create or update an enemy. Returns the enemy id. */
export async function upsertEnemy(id: string | null, data: EnemyFormData): Promise<string> {
  await requireAdmin();
  const db = createAdminClient();
  const payload = { ...data, area_id: data.area_id || null };

  if (id) {
    const { error } = await db.from('enemy_types').update(payload).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/enemies');
    return id;
  }
  const { data: row, error } = await db
    .from('enemy_types')
    .insert({ ...payload, loot_table: [] })
    .select('id')
    .single();
  if (error || !row) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath('/admin/enemies');
  return row.id;
}

/**
 * Replace all loot rows for an enemy with the provided set.
 * Also syncs the legacy JSON loot_table column so existing arena/combat
 * Postgres functions continue to work without changes.
 */
export async function syncEnemyLoot(enemyId: string, rows: EnemyLootRow[]) {
  await requireAdmin();
  const db = createAdminClient();

  await db.from('enemy_loot').delete().eq('enemy_type_id', enemyId);

  if (rows.length > 0) {
    const { error } = await db.from('enemy_loot').insert(
      rows.map(({ id: _id, ...r }) => ({ ...r, enemy_type_id: enemyId }))
    );
    if (error) throw new Error(error.message);
  }

  // Keep JSON loot_table in sync for backward-compat with arena functions.
  const lootJson = rows.map(r => ({
    item: r.item_id,
    weight: r.weight,
    min: r.quantity_min,
    max: r.quantity_max,
  }));
  const { error: syncErr } = await db
    .from('enemy_types')
    .update({ loot_table: lootJson })
    .eq('id', enemyId);
  if (syncErr) throw new Error(syncErr.message);

  revalidatePath('/admin/enemies');
  revalidatePath(`/admin/enemies/${enemyId}`);
}

export async function deleteEnemy(id: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('enemy_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/enemies');
}

