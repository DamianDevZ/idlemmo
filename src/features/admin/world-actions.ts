'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';
import { revalidatePath } from 'next/cache';

export type AreaData = {
  name: string;
  display_name: string;
  description: string;
  icon: string;
  sort_order: number;
};

/** Create or update an area. Returns the area id. */
export async function upsertArea(id: string | null, data: AreaData): Promise<string> {
  await requireAdmin();
  const db = createAdminClient();
  if (id) {
    const { error } = await db.from('areas').update(data).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/world');
    revalidatePath(`/admin/world/${id}`);
    return id;
  }
  const { data: row, error } = await db.from('areas').insert(data).select('id').single();
  if (error || !row) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath('/admin/world');
  return row.id;
}

export async function deleteArea(id: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('areas').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/world');
}

/** Add or update a loot drop for a specific area+tier. Returns the row id. */
export async function upsertAreaTierLoot(row: {
  id?: string;
  area_id: string;
  tier: number;
  item_id: string;
  weight: number;
  quantity_min: number;
  quantity_max: number;
  gather_time_ms: number;
  required_skill_name: string | null;
}): Promise<string> {
  await requireAdmin();
  const db = createAdminClient();
  const { id, ...rest } = row;
  if (id) {
    const { error } = await db.from('area_tier_loot').update(rest).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath(`/admin/world/${rest.area_id}`);
    return id;
  }
  const { data, error } = await db.from('area_tier_loot').insert(rest).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath(`/admin/world/${rest.area_id}`);
  return data.id;
}

/** Remove a single loot drop row. */
export async function deleteAreaTierLoot(id: string, areaId: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('area_tier_loot').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/world/${areaId}`);
}

