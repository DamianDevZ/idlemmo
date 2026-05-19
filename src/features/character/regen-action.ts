'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getGameConfig } from '@/lib/game/getGameConfig';

/**
 * Applies time-elapsed passive HP regeneration for a character.
 * Called on every game page load so regen accumulates even while the player
 * is idle in menus rather than actively in exploration.
 *
 * Regen formula: floor(elapsedMinutes × faith × hpRegenPerFaith)
 * Capped at 60 minutes of back-fill to prevent absurd catch-up after long absences.
 *
 * Returns the updated HP value (for immediate display in the layout nav).
 */
export async function applyPassiveRegen(
  characterId: string,
): Promise<number | null> {
  const supabase = createAdminClient();

  const [charResult, attrResult, { attributes: ATTR }] = await Promise.all([
    supabase
      .from('characters')
      .select('current_hp, last_regen_at')
      .eq('id', characterId)
      .single(),
    supabase
      .from('character_attributes')
      .select('vigor, faith')
      .eq('character_id', characterId)
      .single(),
    getGameConfig(),
  ]);

  const char = charResult.data;
  const attrs = attrResult.data;
  if (!char || !attrs) return null;

  const maxHp = ATTR.baseHp + attrs.vigor * ATTR.hpPerVigor;

  // Always bump last_regen_at so the next load has an accurate baseline
  const now = new Date();

  if (char.current_hp >= maxHp) {
    await supabase
      .from('characters')
      .update({ current_hp: maxHp, last_regen_at: now.toISOString() })
      .eq('id', characterId);
    return maxHp;
  }

  const lastRegen = new Date(char.last_regen_at as string).getTime();
  const elapsedMinutes = Math.min((now.getTime() - lastRegen) / 60_000, 60);
  const regen = Math.floor(elapsedMinutes * attrs.faith * ATTR.hpRegenPerFaith);

  const newHp = Math.min(maxHp, char.current_hp + regen);

  await supabase
    .from('characters')
    .update({ current_hp: newHp, last_regen_at: now.toISOString() })
    .eq('id', characterId);

  return newHp;
}
