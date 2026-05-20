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
 * Returns a name→rate map. Use this once per server action / tick and reuse
 * the map for all awardCategoryXp calls in that request.
 */
export async function getCategoryXpRates(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('skill_categories')
    .select('name, action_xp_per_unit');
  return new Map(
    (data ?? []).map((c: { name: string; action_xp_per_unit: number }) => [
      c.name,
      Number(c.action_xp_per_unit),
    ]),
  );
}
