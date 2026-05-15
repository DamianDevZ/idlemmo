'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type ItemFormData = {
  name: string;
  display_name: string;
  type: string;
  rarity: string;
  description: string;
  stackable: boolean;
  equipment_tier: number | null;
  base_damage: number | null;
  base_defense: number | null;
  primary_damage_type: string | null;
  material_type: string | null;
  primary_scaling_attr: string | null;
  primary_scaling_grade: string | null;
  secondary_scaling_attr: string | null;
  secondary_scaling_grade: string | null;
  image_url: string | null;
};

export async function upsertItem(id: string | null, data: ItemFormData) {
  await requireAdmin();
  const db = createAdminClient();

  if (id) {
    const { error } = await db.from('item_definitions').update(data).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from('item_definitions').insert(data);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/admin/items');
}

export async function deleteItem(id: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('item_definitions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/items');
}

export async function uploadItemIcon(itemId: string, formData: FormData) {
  await requireAdmin();
  const db = createAdminClient();
  const file = formData.get('icon') as File;
  if (!file || file.size === 0) throw new Error('No file provided');

  const ext = file.name.split('.').pop();
  const path = `items/${itemId}.${ext}`;

  const { error: upErr } = await db.storage
    .from('icons')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  const { data: { publicUrl } } = db.storage.from('icons').getPublicUrl(path);
  await db.from('item_definitions').update({ image_url: publicUrl }).eq('id', itemId);
  revalidatePath('/admin/items');
  return publicUrl;
}
