'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { awardMainXp, awardCategoryXp, getCategoryXpRates } from '@/lib/game/xp';
import { recordItemDiscovery } from '@/lib/game/discovery';
import { actionXpForTier } from '@/lib/game/formulas';
import { pickGrade } from '@/lib/game/pickGrade';
import { getGameConfig } from '@/lib/game/getGameConfig';

type Ingredient = { item_id: string; quantity: number };

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

  // Fetch recipe with output item name + type (type determines which crafting XP pool to award)
  const { data: recipe } = await supabase
    .from('recipes')
    .select('id, tier, output_item_id, output_quantity, ingredients, item_definitions!output_item_id(name, display_name, type)')
    .eq('id', recipeId)
    .single();
  if (!recipe) throw new Error('Recipe not found');

  // Verify the character owns a recipe scroll for this output item in their stash.
  // Scrolls are permanent (never consumed) — having one unlocks crafting indefinitely.
  const { data: stashScrolls, error: scrollErr } = await supabase
    .from('character_stash')
    .select('item_id, item_definitions(type, recipe_for_item_id)')
    .eq('character_id', characterId);
  if (scrollErr) throw new Error(`Stash check failed: ${scrollErr.message}`);
  const hasScroll = (stashScrolls ?? []).some(row => {
    const def = row.item_definitions as { type: string; recipe_for_item_id: string | null } | null;
    return def?.type === 'recipe' && def?.recipe_for_item_id === (recipe.output_item_id as string);
  });
  if (!hasScroll) throw new Error('Recipe scroll not in stash');

  // Resolve output item type early — needed for both mastery gate and XP award
  const outputItemType = (recipe.item_definitions as unknown as { name: string; display_name: string; type: string } | null)?.type ?? 'misc';
  const craftingCategory =
    outputItemType === 'weapon' ? 'weapon_crafting' :
    outputItemType === 'armor'  ? 'armor_crafting'  :
    outputItemType === 'tool'   ? 'tool_crafting'   :
    null;

  // Mastery tier gate — T2+ requires per-item crafting mastery to unlock higher tiers.
  // T1 is always accessible once the recipe is known.
  const recipeTier = recipe.tier as number;
  if (recipeTier > 1 && craftingCategory) {
    const { data: mastery } = await supabase
      .from('character_item_mastery')
      .select('tier')
      .eq('character_id', characterId)
      .eq('item_definition_id', recipe.output_item_id as string)
      .eq('category_name', craftingCategory)
      .maybeSingle();
    const masteryTier = (mastery as { tier: number } | null)?.tier ?? -1;
    if (masteryTier < recipeTier - 1) {
      throw new Error(`Requires ${craftingCategory.replace('_', ' ')} tier ${recipeTier - 1} to craft at tier ${recipeTier}`);
    }
  }

  const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
  if (ingredients.length === 0) throw new Error('Recipe has no ingredients');

  // Fetch current inventory for these items using item_id directly
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

  // Validate total (inventory + stash)
  for (const ing of ingredients) {
    const total = (qtyByItemId.get(ing.item_id) ?? 0) + (stashQtyByItemId.get(ing.item_id) ?? 0);
    if (total < ing.quantity) {
      throw new Error(`Not enough of ingredient (need ${ing.quantity}, have ${total})`);
    }
  }

  // Consume ingredients — inventory first, then stash for any remainder
  for (const ing of ingredients) {
    const itemId    = ing.item_id;
    const inInv     = qtyByItemId.get(itemId) ?? 0;
    let   remaining = ing.quantity;

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
      const inStash    = stashQtyByItemId.get(ing.item_id) ?? 0;
      const afterStash = inStash - remaining;
      if (afterStash === 0) {
        await supabase.from('character_stash').delete().eq('character_id', characterId).eq('item_id', itemId);
      } else {
        await supabase.from('character_stash').update({ quantity: afterStash }).eq('character_id', characterId).eq('item_id', itemId);
      }
    }
  }

  // Add crafted item to inventory — equipment always gets a grade drawn from the
  // global grade weight table (same system as loot drops).
  const outputItemName = (recipe.item_definitions as unknown as { name: string; type: string } | null)?.name;
  if (!outputItemName) throw new Error('Output item not found');

  const isEquipment = ['weapon', 'armor', 'tool'].includes(outputItemType);
  let craftedGrade: string | null = null;
  if (isEquipment) {
    const { gradeWeights } = await getGameConfig();
    // Fetch per-item grade weight overrides if configured
    const { data: itemDef } = await supabase
      .from('item_definitions')
      .select('grade_weights')
      .eq('id', recipe.output_item_id as string)
      .single();
    craftedGrade = pickGrade(gradeWeights, (itemDef as { grade_weights: Record<string, number> | null } | null)?.grade_weights);
  }

  await supabase.rpc('add_to_inventory', {
    p_character_id: characterId,
    p_item_name:    outputItemName,
    p_quantity:     recipe.output_quantity as number,
    p_item_rating:  craftedGrade,
  });

  // Record discovery so the item appears on the Skills page
  await recordItemDiscovery(supabase, characterId, [outputItemName]);

  // Award XP — craftingCategory was resolved above from output item type
  const tier = recipeTier;
  const xpCategory = craftingCategory ?? 'weapon_crafting';
  const catRates = await getCategoryXpRates(supabase);
  await Promise.all([
    awardMainXp(supabase, characterId, tier * 10),
    awardCategoryXp(supabase, characterId, xpCategory, actionXpForTier(catRates.base.get(xpCategory) ?? 20, catRates.earnedScaling.get(xpCategory) ?? 1.5, tier)),
  ]);

  revalidatePath('/game/home');
  return { ok: true };
}
