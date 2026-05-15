'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { awardMainXp, awardCategoryXp } from '@/lib/game/xp';

type Ingredient = { name: string; label: string; qty: number };

/**
 * Attempt to craft an item the character knows the recipe for.
 * Consumes ingredients from inventory and adds the output item.
 * Returns { ok: true } or throws with a user-readable message.
 */
export async function craftItem(characterId: string, recipeId: string) {
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

  // Verify recipe is known
  const { data: knownRecipe } = await supabase
    .from('character_known_recipes')
    .select('recipe_id')
    .eq('character_id', characterId)
    .eq('recipe_id', recipeId)
    .single();
  if (!knownRecipe) throw new Error('Recipe not known');

  // Fetch recipe with output item name
  const { data: recipe } = await supabase
    .from('recipes')
    .select('id, tier, output_quantity, ingredients, item_definitions!output_item_id(name, display_name)')
    .eq('id', recipeId)
    .single();
  if (!recipe) throw new Error('Recipe not found');

  const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
  if (ingredients.length === 0) throw new Error('Recipe has no ingredients');

  // Resolve ingredient names → item IDs in one query
  const ingredientNames = ingredients.map(i => i.name);
  const { data: itemDefs } = await supabase
    .from('item_definitions')
    .select('id, name')
    .in('name', ingredientNames);

  const itemIdByName = new Map((itemDefs ?? []).map(d => [d.name as string, d.id as string]));

  // Verify all ingredients have item definitions
  for (const ing of ingredients) {
    if (!itemIdByName.has(ing.name)) throw new Error(`Unknown item: ${ing.label}`);
  }

  // Fetch current inventory for these items
  const itemIds = [...itemIdByName.values()];
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

  // Validate total (inventory + stash)
  for (const ing of ingredients) {
    const itemId = itemIdByName.get(ing.name)!;
    const total  = (qtyByItemId.get(itemId) ?? 0) + (stashQtyByItemId.get(itemId) ?? 0);
    if (total < ing.qty) {
      throw new Error(`Not enough ${ing.label} (need ${ing.qty}, have ${total})`);
    }
  }

  // Consume ingredients — inventory first, then stash for any remainder
  for (const ing of ingredients) {
    const itemId    = itemIdByName.get(ing.name)!;
    const inInv     = qtyByItemId.get(itemId) ?? 0;
    let   remaining = ing.qty;

    if (inInv > 0) {
      const fromInv  = Math.min(inInv, remaining);
      remaining     -= fromInv;
      const afterInv = inInv - fromInv;
      if (afterInv === 0) {
        await supabase.from('character_inventory').delete().eq('character_id', characterId).eq('item_id', itemId);
      } else {
        await supabase.from('character_inventory').update({ quantity: afterInv }).eq('character_id', characterId).eq('item_id', itemId);
      }
    }

    if (remaining > 0) {
      const inStash    = stashQtyByItemId.get(itemId) ?? 0;
      const afterStash = inStash - remaining;
      if (afterStash === 0) {
        await supabase.from('character_stash').delete().eq('character_id', characterId).eq('item_id', itemId);
      } else {
        await supabase.from('character_stash').update({ quantity: afterStash }).eq('character_id', characterId).eq('item_id', itemId);
      }
    }
  }

  // Add crafted item to inventory
  const outputItemName = (recipe.item_definitions as { name: string } | null)?.name;
  if (!outputItemName) throw new Error('Output item not found');

  await supabase.rpc('add_to_inventory', {
    p_character_id: characterId,
    p_item_name:    outputItemName,
    p_quantity:     recipe.output_quantity as number,
  });

  // Award XP for crafting
  const tier = recipe.tier as number;
  await Promise.all([
    awardMainXp(supabase, characterId, tier * 10),
    awardCategoryXp(supabase, characterId, 'crafting', tier * 20),
  ]);

  revalidatePath('/game/home');
  return { ok: true };
}
