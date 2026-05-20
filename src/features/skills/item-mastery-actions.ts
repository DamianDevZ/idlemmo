'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { skillTierXpCost } from '@/lib/game/formulas';

export type ItemMasteryAllocation = {
  /** character_item_mastery.id */
  masteryId: string;
  /** XP to spend on this item */
  xp: number;
};

/**
 * Spend XP from a category pool across one or more discovered items.
 *
 * Rules:
 * - Total XP in allocations must not exceed the character's available pool for
 *   the category.
 * - Each item's XP is applied immediately, advancing tiers when the threshold
 *   is reached.  Overflow XP rolls into the next tier.
 * - Once max_tier is reached, no more XP is accepted for that item.
 */
export async function allocateItemMastery(
  characterId: string,
  categoryName: string,
  allocations: ItemMasteryAllocation[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  // Ownership check
  const { data: char } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!char) return { error: 'Character not found' };

  const valid = allocations.filter(a => a.xp > 0);
  if (!valid.length) return {};

  const totalXp = valid.reduce((s, a) => s + a.xp, 0);

  // Fetch category config (tier cost curve) + XP pool in one go
  const [catResult, maxTierResult] = await Promise.all([
    supabase
      .from('skill_categories')
      .select('id, tier_xp_base, tier_xp_scaling')
      .eq('name', categoryName)
      .single(),
    supabase
      .from('game_config')
      .select('value')
      .eq('key', 'max_tier')
      .single(),
  ]);

  const cat = catResult.data;
  if (!cat) return { error: 'Category not found' };

  const maxTier      = Number((maxTierResult.data as { value?: unknown } | null)?.value ?? 10);
  const tierXpBase   = (cat.tier_xp_base    as number | null) ?? undefined;
  const tierXpScale  = (cat.tier_xp_scaling as number | null) ?? undefined;

  // Fetch available XP pool
  const { data: pool } = await supabase
    .from('character_category_points')
    .select('xp_available')
    .eq('character_id', characterId)
    .eq('category_id', cat.id)
    .single();

  const available = (pool?.xp_available as number) ?? 0;
  if (totalXp > available) return { error: 'Not enough XP in pool' };

  // Fetch current mastery state for requested rows (ownership validated by character_id)
  const masteryIds = valid.map(a => a.masteryId);
  const { data: masteries } = await supabase
    .from('character_item_mastery')
    .select('id, tier, xp_toward_next_tier')
    .in('id', masteryIds)
    .eq('character_id', characterId);

  if (!masteries?.length) return { error: 'No mastery records found' };

  // Apply XP to each item and compute new tier/xp state
  const updates = valid.map(alloc => {
    const mastery = (masteries as { id: string; tier: number; xp_toward_next_tier: number }[])
      .find(m => m.id === alloc.masteryId);
    if (!mastery) return null;

    let tier     = mastery.tier;
    let xpBucket = mastery.xp_toward_next_tier + alloc.xp;

    // Advance tiers until XP runs out or max reached
    while (tier < maxTier) {
      const cost = skillTierXpCost(tier, tierXpBase, tierXpScale);
      if (xpBucket < cost) break;
      xpBucket -= cost;
      tier++;
    }

    // No XP stored above max tier
    if (tier >= maxTier) xpBucket = 0;

    return { id: alloc.masteryId, tier, xp_toward_next_tier: xpBucket };
  }).filter(Boolean) as { id: string; tier: number; xp_toward_next_tier: number }[];

  // Persist all mastery updates + deduct from pool concurrently
  await Promise.all([
    ...updates.map(u =>
      supabase
        .from('character_item_mastery')
        .update({ tier: u.tier, xp_toward_next_tier: u.xp_toward_next_tier })
        .eq('id', u.id)
    ),
    supabase
      .from('character_category_points')
      .update({ xp_available: available - totalXp })
      .eq('character_id', characterId)
      .eq('category_id', cat.id),
  ]);

  revalidatePath('/game/skills');
  return {};
}
