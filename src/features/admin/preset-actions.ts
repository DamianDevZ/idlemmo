'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function updatePresetResistances(presetId: string, resistances: Record<string, number>) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db
    .from('armor_presets')
    .update({ resistances })
    .eq('id', presetId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/presets');
}

export async function upsertPreset(id: string, displayName: string, materialType: string, resistances: Record<string, number>) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db
    .from('armor_presets')
    .upsert({ id, display_name: displayName, material_type: materialType, resistances });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/presets');
}
