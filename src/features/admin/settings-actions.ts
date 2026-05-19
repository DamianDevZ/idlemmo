'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

/**
 * Upsert a single text setting in app_settings.
 * Used for non-numeric config values that can't be stored in game_config.
 */
export async function saveAppSetting(key: string, value: string): Promise<{ error?: string }> {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { error: error.message };
  revalidatePath('/admin/tier-scaling');
  return {};
}
