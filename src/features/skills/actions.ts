'use server';

import { createClient } from '@/lib/supabase/server';
import { skillLevelUpCost } from '@/lib/game/formulas';
import { GAME_CONFIG } from '@/config/game.config';
import { revalidatePath } from 'next/cache';

/**
 * Spend category points to level up a sub-skill.
 * All validation happens server-side — the client never dictates the cost.
 */
export async function allocateCategoryPoint(
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

  // Get current skill level
  const { data: charSkill } = await supabase
    .from('character_skills')
    .select('level')
    .eq('character_id', characterId)
    .eq('skill_id', skillId)
    .single();

  const currentLevel = charSkill?.level ?? 0;
  if (currentLevel >= GAME_CONFIG.skills.maxSkillLevel) throw new Error('Skill already at max level');

  // Server-side cost calculation — client cannot influence this
  const cost = skillLevelUpCost(currentLevel);

  // Get available points
  const { data: catPoints } = await supabase
    .from('character_category_points')
    .select('points_available')
    .eq('character_id', characterId)
    .eq('category_id', categoryId)
    .single();

  const available = catPoints?.points_available ?? 0;
  if (available < cost) throw new Error(`Not enough points (need ${cost}, have ${available})`);

  // Deduct points
  const { error: pointErr } = await supabase
    .from('character_category_points')
    .update({ points_available: available - cost })
    .eq('character_id', characterId)
    .eq('category_id', categoryId);
  if (pointErr) throw new Error(pointErr.message);

  // Level up skill (upsert in case row doesn't exist yet)
  const { error: skillErr } = await supabase
    .from('character_skills')
    .upsert(
      { character_id: characterId, skill_id: skillId, level: currentLevel + 1, xp_toward_next_level: 0 },
      { onConflict: 'character_id,skill_id' },
    );
  if (skillErr) throw new Error(skillErr.message);

  revalidatePath('/game/skills');
}
