'use server';

import { createAdminClient } from '@/lib/supabase/admin';
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
