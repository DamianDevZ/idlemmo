'use server';

import { createClient } from '@/lib/supabase/server';
import { skillTierXpCost, tiersFromXp } from '@/lib/game/formulas';
import { GAME_CONFIG } from '@/config/game.config';
import { revalidatePath } from 'next/cache';

/**
 * Spend category XP to unlock the next tier of a single skill.
 * Cost = skillTierXpCost(currentTier). All validation server-side.
 */
export async function allocateCategoryXp(
  characterId: string,
  categoryId: string,
  skillId: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Verify ownership
  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  // Get current skill tier
  const { data: charSkill } = await supabase
    .from('character_skills')
    .select('level')
    .eq('character_id', characterId)
    .eq('skill_id', skillId)
    .single();

  const currentTier = charSkill?.level ?? 0;
  const maxTier = GAME_CONFIG.skills.maxSkillLevel;
  if (currentTier >= maxTier) throw new Error('Skill already at max tier');

  // Fetch per-category tier cost params (overrides global defaults)
  const { data: catRow } = await supabase
    .from('skill_categories')
    .select('tier_xp_base, tier_xp_scaling')
    .eq('id', categoryId)
    .single();
  const tierXpBase    = (catRow?.tier_xp_base    as number | null) ?? undefined;
  const tierXpScaling = (catRow?.tier_xp_scaling as number | null) ?? undefined;

  // Server-side cost — client cannot influence this
  const cost = skillTierXpCost(currentTier, tierXpBase, tierXpScaling);

  // Get available XP
  const { data: catXp } = await supabase
    .from('character_category_points')
    .select('xp_available')
    .eq('character_id', characterId)
    .eq('category_id', categoryId)
    .single();

  const available = (catXp?.xp_available as number) ?? 0;
  if (available < cost) throw new Error(`Not enough XP (need ${cost}, have ${available})`);

  // Deduct XP from pool
  const { error: xpErr } = await supabase
    .from('character_category_points')
    .update({ xp_available: available - cost })
    .eq('character_id', characterId)
    .eq('category_id', categoryId);
  if (xpErr) throw new Error(xpErr.message);

  // Advance skill tier (upsert in case row doesn't exist yet)
  const { error: skillErr } = await supabase
    .from('character_skills')
    .upsert(
      { character_id: characterId, skill_id: skillId, level: currentTier + 1, xp_toward_next_level: 0 },
      { onConflict: 'character_id,skill_id' },
    );
  if (skillErr) throw new Error(skillErr.message);

  revalidatePath('/game/skills');
}

/**
 * Bulk-allocate XP across multiple skills in the same category at once.
 * Returns a summary of tiers gained per skill.
 */
export async function bulkAllocateCategoryXp(
  characterId: string,
  categoryId: string,
  allocations: { skillId: string; xpAmount: number }[],
): Promise<{ skillId: string; tiersGained: number }[]> {
  if (allocations.length === 0) return [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  const { data: catXp } = await supabase
    .from('character_category_points')
    .select('xp_available')
    .eq('character_id', characterId)
    .eq('category_id', categoryId)
    .single();

  const available = (catXp?.xp_available as number) ?? 0;
  const maxTier = GAME_CONFIG.skills.maxSkillLevel;

  // Fetch per-category tier cost params
  const { data: catRow } = await supabase
    .from('skill_categories')
    .select('tier_xp_base, tier_xp_scaling')
    .eq('id', categoryId)
    .single();
  const tierXpBase    = (catRow?.tier_xp_base    as number | null) ?? undefined;
  const tierXpScaling = (catRow?.tier_xp_scaling as number | null) ?? undefined;

  // Fetch current tiers for all requested skills
  const skillIds = allocations.map(a => a.skillId);
  const { data: charSkills } = await supabase
    .from('character_skills')
    .select('skill_id, level')
    .eq('character_id', characterId)
    .in('skill_id', skillIds);

  const tierBySkill = new Map<string, number>(
    (charSkills ?? []).map(s => [s.skill_id as string, s.level as number]),
  );

  // Compute total XP to deduct and per-skill gains
  let totalSpent = 0;
  const results: { skillId: string; tiersGained: number; newTier: number; xpSpent: number }[] = [];

  for (const { skillId, xpAmount } of allocations) {
    if (xpAmount <= 0) continue;
    const currentTier = tierBySkill.get(skillId) ?? 0;
    const { tiersGained, xpSpent } = tiersFromXp(currentTier, maxTier, xpAmount, tierXpBase, tierXpScaling);
    results.push({ skillId, tiersGained, newTier: currentTier + tiersGained, xpSpent });
    totalSpent += xpSpent;
  }

  if (totalSpent > available) throw new Error(`Not enough XP (need ${totalSpent}, have ${available})`);
  if (totalSpent === 0) return [];

  // Deduct from pool
  const { error: xpErr } = await supabase
    .from('character_category_points')
    .update({ xp_available: available - totalSpent })
    .eq('character_id', characterId)
    .eq('category_id', categoryId);
  if (xpErr) throw new Error(xpErr.message);

  // Apply tier updates
  for (const { skillId, newTier, tiersGained } of results) {
    if (tiersGained === 0) continue;
    const { error } = await supabase
      .from('character_skills')
      .upsert(
        { character_id: characterId, skill_id: skillId, level: newTier, xp_toward_next_level: 0 },
        { onConflict: 'character_id,skill_id' },
      );
    if (error) throw new Error(error.message);
  }

  revalidatePath('/game/skills');
  return results.map(r => ({ skillId: r.skillId, tiersGained: r.tiersGained }));
}

