'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';
import { revalidatePath } from 'next/cache';

export type TierScalingRow = {
  id?: string;
  item_type: string;
  stat_key: string;
  stat_label: string;
  tier: number;
  multiplier: number;
};

/** Upsert a batch of tier scaling rows for a single item_type. */
export async function upsertTierScalingRows(rows: TierScalingRow[]) {
  if (rows.length === 0) return;
  const db = createAdminClient();
  const { error } = await db
    .from('tier_scaling_config')
    .upsert(
      rows.map(({ id: _id, ...r }) => r), // strip id so ON CONFLICT key is used
      { onConflict: 'item_type,stat_key,tier' }
    );
  if (error) throw new Error(error.message);
  revalidatePath('/admin/tier-scaling');
  revalidatePath('/admin/items/[id]', 'page');
}

/** Remove all tier rows for a specific (item_type, stat_key) pair. */
export async function deleteTierScalingStat(item_type: string, stat_key: string) {
  const db = createAdminClient();
  const { error } = await db
    .from('tier_scaling_config')
    .delete()
    .eq('item_type', item_type)
    .eq('stat_key', stat_key);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/tier-scaling');
  revalidatePath('/admin/items/[id]', 'page');
}

/**
 * Upload a tier frame image. Stored at icons/tier-frames/t{tier}.{ext}.
 * Always overwrites the previous frame for that tier.
 * Returns the public URL.
 */
export async function uploadTierFrame(tier: number, formData: FormData): Promise<string> {
  await requireAdmin();
  const db = createAdminClient();
  const file = formData.get('frame') as File;
  if (!file || file.size === 0) throw new Error('No file provided');

  const ext = file.name.split('.').pop() ?? 'png';
  const path = `tier-frames/t${tier}.${ext}`;

  // Remove old frame files for this tier (any extension) to avoid orphans
  const { data: existing } = await db.storage.from('icons').list('tier-frames', { search: `t${tier}.` });
  if (existing && existing.length > 0) {
    await db.storage.from('icons').remove(existing.map(f => `tier-frames/${f.name}`));
  }

  const { error } = await db.storage
    .from('icons')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);

  const { data: { publicUrl } } = db.storage.from('icons').getPublicUrl(path);
  revalidatePath('/admin/tier-scaling');
  return publicUrl;
}
