'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { awardMainXp, awardCategoryXp } from '@/lib/game/xp';

type Ingredient = { item_id: string; quantity: number };

/**
 * Refine raw materials into processed goods.
 * Unlike crafting, refining recipes are always available — no discovery required.
 */
export async function refineItem(characterId: string, recipeId: string) {
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

  // Validate total (inventory + stash) quantities
  for (const ing of ingredients) {
    const total = (qtyByItemId.get(ing.item_id) ?? 0) + (stashQtyByItemId.get(ing.item_id) ?? 0);
    if (total < ing.quantity) {
      throw new Error(`Not enough of ingredient (need ${ing.quantity}, have ${total})`);
    }
  }

  // Consume ingredients — inventory first, then stash for any remainder
  for (const ing of ingredients) {
    const itemId     = ing.item_id;
    const inInv      = qtyByItemId.get(itemId) ?? 0;
    let   remaining  = ing.quantity;

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
    p_quantity:     recipe.output_quantity as number,
  });

  // Award XP for refining
  const tier = recipe.tier as number;
  await Promise.all([
    awardMainXp(supabase, characterId, tier * 6),
    awardCategoryXp(supabase, characterId, 'refining', tier * 15),
  ]);

  revalidatePath('/game/home');
  return { ok: true };
}
