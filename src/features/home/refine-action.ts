'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { awardMainXp, awardCategoryXp, getCategoryXpRates } from '@/lib/game/xp';
import { actionXpForTier } from '@/lib/game/formulas';

type Ingredient = { item_id: string; quantity: number };

/**
 * Refine raw materials into processed goods.
 * Unlike crafting, refining recipes are always available — no discovery required.
 */
export async function refineItem(characterId: string, recipeId: string, times: number = 1) {
  if (!Number.isInteger(times) || times < 1 || times > 10000) throw new Error('Invalid quantity');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Verify character ownership
  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  // Fetch the refining recipe (must be category = 'refining')
  const { data: recipe } = await supabase
    .from('recipes')
    .select('id, tier, output_quantity, ingredients, item_definitions!output_item_id(name, display_name)')
    .eq('id', recipeId)
    .eq('category', 'refining')
    .single();
  if (!recipe) throw new Error('Recipe not found');

  const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
  if (ingredients.length === 0) throw new Error('Recipe has no ingredients');

  // Mastery tier gate — T2+ requires per-material refining mastery to unlock higher tiers.
  // T1 is always accessible. The mastery row is keyed to the raw input material's item_definition_id.
  const recipeTier = recipe.tier as number;
  if (recipeTier > 1) {
    const { data: mastery } = await supabase
      .from('character_item_mastery')
      .select('tier')
      .eq('character_id', characterId)
      .eq('item_definition_id', ingredients[0].item_id)
      .eq('category_name', 'refining')
      .maybeSingle();
    const masteryTier = (mastery as { tier: number } | null)?.tier ?? -1;
    if (masteryTier < recipeTier - 1) {
      throw new Error(`Requires refining tier ${recipeTier - 1} to refine tier ${recipeTier}`);
    }
  }

  // Use item_id directly — no name resolution needed
  const itemIds = ingredients.map(i => i.item_id);
  const { data: invRows } = await supabase
    .from('character_inventory')
    .select('item_id, quantity')
    .eq('character_id', characterId)
    .in('item_id', itemIds);

  const { data: stashRows } = await supabase
    .from('character_stash')
    .select('item_id, quantity')
    .eq('character_id', characterId)
    .in('item_id', itemIds);

  const qtyByItemId      = new Map((invRows   ?? []).map(r => [r.item_id as string, r.quantity as number]));
  const stashQtyByItemId = new Map((stashRows ?? []).map(r => [r.item_id as string, r.quantity as number]));

  // Validate total (inventory + stash) quantities (scaled by times)
  for (const ing of ingredients) {
    const total   = (qtyByItemId.get(ing.item_id) ?? 0) + (stashQtyByItemId.get(ing.item_id) ?? 0);
    const needed  = ing.quantity * times;
    if (total < needed) {
      throw new Error(`Not enough of ingredient (need ${needed}, have ${total})`);
    }
  }

  // Consume ingredients — inventory first, then stash for any remainder
  for (const ing of ingredients) {
    const itemId     = ing.item_id;
    const inInv      = qtyByItemId.get(itemId) ?? 0;
    let   remaining  = ing.quantity * times;

    if (inInv > 0) {
      const fromInv = Math.min(inInv, remaining);
      remaining    -= fromInv;
      const afterInv = inInv - fromInv;
      if (afterInv === 0) {
        await supabase.from('character_inventory').delete().eq('character_id', characterId).eq('item_id', itemId);
      } else {
        await supabase.from('character_inventory').update({ quantity: afterInv }).eq('character_id', characterId).eq('item_id', itemId);
      }
    }

    if (remaining > 0) {
      const inStash    = stashQtyByItemId.get(ing.item_id) ?? 0;
      const afterStash = inStash - remaining;
      if (afterStash === 0) {
        await supabase.from('character_stash').delete().eq('character_id', characterId).eq('item_id', itemId);
      } else {
        await supabase.from('character_stash').update({ quantity: afterStash }).eq('character_id', characterId).eq('item_id', itemId);
      }
    }
  }

  // Add refined output to inventory
  const outputItemName = (recipe.item_definitions as unknown as { name: string } | null)?.name;
  if (!outputItemName) throw new Error('Output item not found');

  await supabase.rpc('add_to_inventory', {
    p_character_id: characterId,
    p_item_name:    outputItemName,
    p_quantity:     (recipe.output_quantity as number) * times,
  });

  // Award XP for refining — exponential curve: floor(base × scaling^(tier-1)), multiplied by times
  const catRates = await getCategoryXpRates(supabase);
  await Promise.all([
    awardMainXp(supabase, characterId, recipeTier * 6 * times),
    awardCategoryXp(supabase, characterId, 'refining', actionXpForTier(catRates.base.get('refining') ?? 15, catRates.earnedScaling.get('refining') ?? 1.5, recipeTier) * times),
  ]);

  revalidatePath('/game/home');
  return { ok: true };
}
