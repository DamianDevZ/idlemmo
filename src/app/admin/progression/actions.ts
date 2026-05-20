'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type CategoryProgressionUpdate = {
  id: string;
  action_xp_per_unit: number;
  action_xp_scaling:  number;
  tier_xp_base: number;
  tier_xp_scaling: number;
};

export async function saveCategoryProgression(
  updates: CategoryProgressionUpdate[],
): Promise<{ error?: string }> {
  await requireAdmin();

  if (!updates.length) return {};

  for (const u of updates) {
    if (!Number.isFinite(u.action_xp_per_unit) || u.action_xp_per_unit < 0)
      return { error: `action_xp_per_unit must be a non-negative number.` };
    if (!Number.isFinite(u.action_xp_scaling) || u.action_xp_scaling < 1)
      return { error: `Earned XP Scaling must be ≥ 1.0.` };
    if (!Number.isFinite(u.tier_xp_base) || u.tier_xp_base <= 0)
      return { error: `Tier XP Base must be greater than 0.` };
    if (!Number.isFinite(u.tier_xp_scaling) || u.tier_xp_scaling < 1)
      return { error: `Tier Cost Scaling must be ≥ 1.0.` };
  }

  const db = createAdminClient();

  for (const u of updates) {
    const { error } = await db
      .from('skill_categories')
      .update({
        action_xp_per_unit: u.action_xp_per_unit,
        action_xp_scaling:  u.action_xp_scaling,
        tier_xp_base:       u.tier_xp_base,
        tier_xp_scaling:    u.tier_xp_scaling,
      })
      .eq('id', u.id);
    if (error) return { error: error.message };
  }

  revalidatePath('/admin/progression');
  return {};
}
