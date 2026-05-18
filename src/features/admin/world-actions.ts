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

/** Upload and store a landscape banner image for an area. Returns the public URL. */
export async function uploadAreaImage(areaId: string, formData: FormData): Promise<string> {
  await requireAdmin();
  const db = createAdminClient();
  const file = formData.get('image') as File;
  if (!file || file.size === 0) throw new Error('No file provided');

  const ext = file.name.split('.').pop();
  const path = `areas/${areaId}.${ext}`;

  // Remove existing area images (may have a different extension)
  const { data: existing } = await db.storage.from('icons').list('areas', { search: `${areaId}.` });
  if (existing?.length) {
    await db.storage.from('icons').remove(existing.map(f => `areas/${f.name}`));
  }

  const { error } = await db.storage
    .from('icons')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);

  const { data: { publicUrl } } = db.storage.from('icons').getPublicUrl(path);
  await db.from('areas').update({ image_url: publicUrl }).eq('id', areaId);
  revalidatePath(`/admin/world/${areaId}`);
  return publicUrl;
}

/** Remove a single loot drop row. */
export async function deleteAreaTierLoot(id: string, areaId: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('area_tier_loot').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/world/${areaId}`);
}

