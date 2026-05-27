'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Consumes a recipe scroll from the character's stash and teaches them
 * all crafting recipes associated with that scroll's target item.
 *
 * Flow:
 *  1. Verify the character owns the stash row (instance_id + character_id)
 *  2. Confirm the item is type='recipe' and has a recipe_for_item_id
 *  3. Find all recipes whose output_item_id matches recipe_for_item_id
 *  4. Upsert each into character_known_recipes (idempotent)
 *  5. Remove the scroll from stash (decrement qty or delete)
 *  6. Revalidate home page
 */
export async function useRecipeScroll(characterId: string, instanceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Verify character belongs to authenticated user
  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  // Fetch the stash row with its item definition
  const { data: stashRow, error: stashErr } = await supabase
    .from('character_stash')
    .select('instance_id, item_id, quantity, item_definitions!inner(type, recipe_for_item_id)')
    .eq('instance_id', instanceId)
    .eq('character_id', characterId)
    .single();

  if (stashErr || !stashRow) throw new Error('Item not found in stash');

  const def = stashRow.item_definitions as unknown as {
    type: string;
    recipe_for_item_id: string | null;
  };

  if (def.type !== 'recipe') throw new Error('Item is not a recipe scroll');
  if (!def.recipe_for_item_id) throw new Error('Scroll has no linked recipe item');

  // Find all crafting recipes that produce this item (covers T1–T10)
  const { data: recipes, error: recipesErr } = await supabase
    .from('recipes')
    .select('id')
    .eq('output_item_id', def.recipe_for_item_id);

  if (recipesErr) throw new Error('Failed to look up recipes');
  if (!recipes || recipes.length === 0) throw new Error('No recipes found for this scroll');

  // Add all recipe tiers to character_known_recipes (idempotent via conflict ignore)
  const rows = recipes.map(r => ({
    character_id: characterId,
    recipe_id: r.id,
    learned_at: new Date().toISOString(),
  }));

  const { error: insertErr } = await supabase
    .from('character_known_recipes')
    .upsert(rows, { onConflict: 'character_id,recipe_id', ignoreDuplicates: true });

  if (insertErr) throw new Error('Failed to learn recipe');

  // Remove or decrement the scroll from stash
  if (stashRow.quantity > 1) {
    await supabase
      .from('character_stash')
      .update({ quantity: stashRow.quantity - 1 })
      .eq('instance_id', instanceId)
      .eq('character_id', characterId);
  } else {
    await supabase
      .from('character_stash')
      .delete()
      .eq('instance_id', instanceId)
      .eq('character_id', characterId);
  }

  revalidatePath('/game/home');
  return { ok: true };
}
