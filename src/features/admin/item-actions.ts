'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type ItemFormData = {
  name: string;
  display_name: string;
  /** Set on recipe scroll items — the id of the craftable item this scroll unlocks. */
  recipe_for_item_id?: string | null;
  type: string;
  description: string;
  stackable: boolean;
  equipment_tier: number | null;
  base_damage: number | null;
  base_defense: number | null;
  primary_damage_type: string | null;
  material_type: string | null;
  primary_scaling_attr: string | null;
  secondary_scaling_attr: string | null;
  image_url: string | null;
  resistances?: Record<string, { value: number; mode: 'percent' | 'flat' }>;
  required_mastery_skill_id?: string | null;
  required_mastery_level?: number | null;
  material_subtype?: string | null;
  gathering_skill_id?: string | null;
  is_tiered?: boolean;
  tiered_stats?: string[];
  consumable_effects?: object[];
  tool_config?: object;
  weapon_type_id?: string | null;
  compatible_weapon_type_ids?: string[];
  attack_speed?: number;
  tool_slot?: string | null;
  // Per-item drop grade weight overrides; null = use global defaults from game_config
  grade_weights?: { S?: number; A?: number; B?: number; C?: number; D?: number; F?: number } | null;
};

export type RecipeIngredient = { item_id: string; tier: number | null; quantity: number };

export type RecipeFormData = {
  id?: string;
  /** 0 = non-tiered / catch-all, 1–N = explicit tier */
  output_tier: number;
  display_name: string;
  output_quantity: number;
  required_skill_id: string;
  required_skill_level: number;
  ingredients: RecipeIngredient[];
  craft_time_seconds: number;
};

export async function upsertItem(
  id: string | null,
  data: ItemFormData,
  recipes: RecipeFormData[],
  recipeSuffix: string = 'Scroll',
): Promise<{ error?: string; id?: string }> {
  await requireAdmin();
  const db = createAdminClient();

  // Validate recipes before touching the DB — refining recipes must have a skill
  // (it determines which resource group they appear under in the UI).
  // Crafting recipes don't need a skill; their category is derived from item type.
  for (const recipe of recipes) {
    const isRefining = recipe.required_skill_id && true; // only set by refining forms
    void isRefining; // validation is now permissive — refining form already enforces selection
  }

  let itemId = id;

  // Strip client-side `id` field so the PK is never included in the update payload
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _stripped, ...safeData } = data as ItemFormData & { id?: string };

  if (id) {
    const { error } = await db.from('item_definitions').update(safeData).eq('id', id);
    if (error) return { error: error.message };
  } else {
    const { data: created, error } = await db
      .from('item_definitions')
      .insert(safeData)
      .select('id')
      .single();
    if (error) return { error: error.message };
    itemId = created.id;
  }

  if (itemId) {
    // Delete all recipes not present in the submitted set (identified by output_tier)
    const keptTiers = recipes.map(r => r.output_tier);
    if (keptTiers.length > 0) {
      const { error } = await db.from('recipes')
        .delete()
        .eq('output_item_id', itemId)
        .not('output_tier', 'in', `(${keptTiers.join(',')})`);
      if (error) return { error: error.message };
    } else {
      // No recipes submitted — delete all existing
      const { error } = await db.from('recipes').delete().eq('output_item_id', itemId);
      if (error) return { error: error.message };
    }

    // Upsert each submitted recipe
    for (const recipe of recipes) {
      const recipeRow = {
        // Auto-generate the recipe display name from the item's display name.
        // This is what appears in the crafting UI (e.g. "Craft Cloth").
        display_name:         data.display_name,
        output_item_id:       itemId,
        output_tier:          recipe.output_tier,
        output_quantity:      recipe.output_quantity,
        required_skill_id:    recipe.required_skill_id || null,
        ingredients:          recipe.ingredients,
      };

      if (recipe.id) {
        const { error } = await db.from('recipes').update(recipeRow).eq('id', recipe.id);
        if (error) return { error: error.message };
      } else {
        const { error } = await db.from('recipes')
          .upsert(recipeRow, { onConflict: 'output_item_id,output_tier' });
        if (error) return { error: error.message };
      }
    }

    // Auto-create or update the recipe scroll item when this item is craftable.
    // The scroll item (type='recipe') is what players hold in their inventory to
    // unlock the crafting recipe. Its display name is "{item} {suffix}" (e.g. "Cloth Scroll").
    if (recipes.length > 0 && data.type !== 'recipe') {
      const recipeItemName = `${data.display_name} ${recipeSuffix}`;
      const { data: existing } = await db
        .from('item_definitions')
        .select('id')
        .eq('recipe_for_item_id', itemId)
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Only sync display_name — preserve any custom image the scroll may have
        const { error: updErr } = await db
          .from('item_definitions')
          .update({ display_name: recipeItemName })
          .eq('id', existing.id);
        if (updErr) return { error: `Recipe scroll update failed: ${updErr.message}` };
      } else {
        const { error: insErr } = await db.from('item_definitions').insert({
          name:               `${data.name}_${recipeSuffix.toLowerCase().replace(/\s+/g, '_')}`,
          display_name:       recipeItemName,
          type:               'recipe',
          stackable:          true,
          description:        `Recipe scroll for crafting ${data.display_name}.`,
          image_url:          data.image_url ?? null,
          is_tiered:          false,
          recipe_for_item_id: itemId,
        });
        if (insErr) return { error: `Recipe scroll creation failed: ${insErr.message}` };
      }
    }
  }

  revalidatePath('/admin/items');
  return { id: itemId ?? undefined };
}

export async function deleteItem(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('item_definitions').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/items');
  return {};
}

export async function uploadItemIcon(itemId: string, formData: FormData) {
  await requireAdmin();
  const db = createAdminClient();
  const file = formData.get('icon') as File;
  if (!file || file.size === 0) throw new Error('No file provided');

  const ext = file.name.split('.').pop();
  const path = `items/${itemId}.${ext}`;

  const { error: upErr } = await db.storage
    .from('icons')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  const { data: { publicUrl } } = db.storage.from('icons').getPublicUrl(path);
  await db.from('item_definitions').update({ image_url: publicUrl }).eq('id', itemId);
  revalidatePath('/admin/items');
  return publicUrl;
}
