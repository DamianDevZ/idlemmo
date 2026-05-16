'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { AttributeName } from '@/types/game';
import { GAME_CONFIG } from '@/config/game.config';

/** Spend one or more skill points to raise an attribute. */
export async function spendSkillPoint(characterId: string, attribute: AttributeName, count = 1) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  if (count < 1 || count > 100) throw new Error('Invalid count');

  // Verify ownership
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select('id, user_id, skill_points_available')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();

  if (charErr || !character) throw new Error('Character not found');
  if (character.skill_points_available < count) throw new Error('Not enough skill points');

  const { data: attrs } = await supabase
    .from('character_attributes')
    .select(attribute)
    .eq('character_id', characterId)
    .single();

  const current = (attrs as Record<string, number>)?.[attribute] ?? 0;
  const maxVal = GAME_CONFIG.attributes.maxValue;
  const toAdd = Math.min(count, maxVal - current);
  if (toAdd <= 0) throw new Error('Attribute already at max');

  const { error: attrErr } = await supabase
    .from('character_attributes')
    .update({ [attribute]: current + toAdd })
    .eq('character_id', characterId);

  if (attrErr) throw new Error(attrErr.message);

  const { error: spErr } = await supabase
    .from('characters')
    .update({ skill_points_available: character.skill_points_available - toAdd })
    .eq('id', characterId);

  if (spErr) throw new Error(spErr.message);

  revalidatePath('/game/character');
}
