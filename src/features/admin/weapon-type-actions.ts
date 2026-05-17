'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function createWeaponType(name: string, displayName: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db
    .from('weapon_types')
    .insert({ name: name.trim().toLowerCase().replace(/\s+/g, '_'), display_name: displayName.trim() });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/weapon-types');
}

export async function deleteWeaponType(id: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('weapon_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/weapon-types');
}
