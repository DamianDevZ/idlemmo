/**
 * Server-side XP award utilities.
 * Handles main level XP + category XP → category point conversion.
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
 * Converts XP to category points when the threshold is crossed.
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
    .select('xp_current, points_available, points_total_earned')
    .eq('character_id', characterId)
    .eq('category_id', cat.id as string)
    .single();

  const xpPerPoint = GAME_CONFIG.skills.categoryXpPerPoint;
  // If the row is somehow missing (pre-fix characters), start from 0
  let newXp   = ((row?.xp_current as number) ?? 0) + amount;
  const earned = Math.floor(newXp / xpPerPoint);
  newXp        = newXp % xpPerPoint;

  // Upsert — creates the row if it was never seeded (safety net for old chars)
  await supabase
    .from('character_category_points')
    .upsert({
      character_id:        characterId,
      category_id:         cat.id as string,
      xp_current:          newXp,
      points_available:    ((row?.points_available    as number) ?? 0) + earned,
      points_total_earned: ((row?.points_total_earned as number) ?? 0) + earned,
    }, { onConflict: 'character_id,category_id' });
}
