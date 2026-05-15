'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { AttributeName } from '@/types/game';
import { GAME_CONFIG } from '@/config/game.config';

/** Spend one skill point to raise an attribute by 1. */
export async function spendSkillPoint(characterId: string, attribute: AttributeName) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Verify ownership
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select('id, user_id, skill_points_available')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();

  if (charErr || !character) throw new Error('Character not found');
  if (character.skill_points_available < 1) throw new Error('No skill points available');

  const { data: attrs } = await supabase
    .from('character_attributes')
    .select(attribute)
    .eq('character_id', characterId)
    .single();

  const current = (attrs as Record<string, number>)?.[attribute] ?? 0;
  if (current >= GAME_CONFIG.attributes.maxValue) throw new Error('Attribute already at max');

  // Decrement skill_points, increment attribute — both in same transaction via RPC ideally,
  // but we use sequential updates here since game logic runs server-side.
  const { error: attrErr } = await supabase
    .from('character_attributes')
    .update({ [attribute]: current + 1 })
    .eq('character_id', characterId);

  if (attrErr) throw new Error(attrErr.message);

  const { error: spErr } = await supabase
    .from('characters')
    .update({ skill_points_available: character.skill_points_available - 1 })
    .eq('id', characterId);

  if (spErr) throw new Error(spErr.message);

  revalidatePath('/game/character');
}
