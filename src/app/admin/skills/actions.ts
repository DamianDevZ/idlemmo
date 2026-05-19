'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function updateSkill(
  id: string,
  display_name: string,
  description: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const db = createAdminClient();

  const { error } = await db
    .from('skills')
    .update({ display_name: display_name.trim(), description: description.trim() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/skills');
  revalidatePath('/game/skills');
  return { ok: true };
}
