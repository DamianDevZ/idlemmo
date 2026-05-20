/**
 * Server-side XP award utilities.
 * Handles main level XP (cascade level-ups + skill points) and category XP
 * (accumulates directly into the category pool for manual tier allocation).
 * Must be called from server actions only (Supabase client passed in).
 */
import { xpRequiredForLevel } from './formulas';
import { GAME_CONFIG } from '@/config/game.config';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Award main character XP and cascade level-ups. */
export async function awardMainXp(
  supabase: SupabaseClient,
  characterId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;

  const { data: char } = await supabase
    .from('characters')
    .select('main_level, main_xp, skill_points_available')
    .eq('id', characterId)
    .single();
  if (!char) return;

  let xp    = (char.main_xp    as number) + amount;
  let level = char.main_level  as number;
  let levelsGained = 0;

  // Keep levelling up while XP overflows
  while (xp >= xpRequiredForLevel(level)) {
    xp -= xpRequiredForLevel(level);
    level++;
    levelsGained++;
  }

  await supabase
    .from('characters')
    .update({
      main_xp:                xp,
      main_level:             level,
      skill_points_available: (char.skill_points_available as number) + levelsGained * GAME_CONFIG.character.skillPointsPerLevel,
    })
    .eq('id', characterId);
}

/**
 * Award XP to a skill category (e.g. 'gathering', 'crafting', 'usage').
 * XP accumulates directly in the category pool; players spend it manually
 * to unlock skill tiers.
 */
export async function awardCategoryXp(
  supabase: SupabaseClient,
  characterId: string,
  categoryName: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;

  // Look up category ID by name
  const { data: cat } = await supabase
    .from('skill_categories')
    .select('id')
    .eq('name', categoryName)
    .single();
  if (!cat) return;

  const { data: row } = await supabase
    .from('character_category_points')
    .select('xp_available, xp_total_earned')
    .eq('character_id', characterId)
    .eq('category_id', cat.id as string)
    .single();

  // Upsert — creates the row if it was never seeded (safety net for new chars)
  await supabase
    .from('character_category_points')
    .upsert({
      character_id:    characterId,
      category_id:     cat.id as string,
      xp_available:    ((row?.xp_available    as number) ?? 0) + amount,
      xp_total_earned: ((row?.xp_total_earned as number) ?? 0) + amount,
    }, { onConflict: 'character_id,category_id' });
}

/**
 * Fetch action_xp_per_unit for all skill categories in one query.
 * Returns `{ base, earnedScaling, costScaling }` maps keyed by category name.
 * - `base`          → action_xp_per_unit  (mastery: fraction of combat XP; others: T1 earned XP)
 * - `earnedScaling` → action_xp_scaling   (scaling curve for XP earned per action)
 * - `costScaling`   → tier_xp_scaling     (scaling curve for tier-up XP cost)
 * Fetch once per request and reuse across all awardCategoryXp calls.
 */
export async function getCategoryXpRates(
  supabase: SupabaseClient,
): Promise<{ base: Map<string, number>; earnedScaling: Map<string, number>; costScaling: Map<string, number> }> {
  const { data } = await supabase
    .from('skill_categories')
    .select('name, action_xp_per_unit, action_xp_scaling, tier_xp_scaling');
  const rows = (data ?? []) as { name: string; action_xp_per_unit: number; action_xp_scaling: number; tier_xp_scaling: number }[];
  return {
    base:          new Map(rows.map(c => [c.name, Number(c.action_xp_per_unit)])),
    earnedScaling: new Map(rows.map(c => [c.name, Number(c.action_xp_scaling)])),
    costScaling:   new Map(rows.map(c => [c.name, Number(c.tier_xp_scaling)])),
  };
}
