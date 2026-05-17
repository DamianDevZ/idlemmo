'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type ItemFormData = {
  name: string;
  display_name: string;
  type: string;
  rarity: string;
  description: string;
  stackable: boolean;
  equipment_tier: number | null;
  base_damage: number | null;
  base_defense: number | null;
  primary_damage_type: string | null;
  material_type: string | null;
  primary_scaling_attr: string | null;
  primary_scaling_grade: string | null;
  secondary_scaling_attr: string | null;
  secondary_scaling_grade: string | null;
  image_url: string | null;
  resistances?: Record<string, { value: number; mode: 'percent' | 'flat' }>;
  required_mastery_skill_id?: string | null;
  required_mastery_level?: number | null;
  material_subtype?: string | null;
  gathering_skill_id?: string | null;
  is_tiered?: boolean;
};

export type RecipeIngredient = { item_id: string; tier: number | null; quantity: number };

export type RecipeFormData = {
  id?: string;
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
  recipe: RecipeFormData | null,
) {
  await requireAdmin();
  const db = createAdminClient();

  let itemId = id;

  if (id) {
    const { error } = await db.from('item_definitions').update(data).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { data: created, error } = await db
      .from('item_definitions')
      .insert(data)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    itemId = created.id;
  }

  // Upsert or delete the crafting recipe
  if (recipe && itemId) {
    const recipeRow = {
      display_name:        recipe.display_name,
      output_item_id:      itemId,
      output_quantity:     recipe.output_quantity,
      required_skill_id:   recipe.required_skill_id,
      required_skill_level: recipe.required_skill_level,
      ingredients:         recipe.ingredients,
      base_success_chance: 100,
      craft_time_seconds:  recipe.craft_time_seconds,
    };

    if (recipe.id) {
      const { error } = await db.from('recipes').update(recipeRow).eq('id', recipe.id);
      if (error) throw new Error(error.message);
    } else {
      // ON CONFLICT on output_item_id (unique constraint from migration 028)
      const { error } = await db.from('recipes').upsert(recipeRow, { onConflict: 'output_item_id' });
      if (error) throw new Error(error.message);
    }
  } else if (!recipe && itemId) {
    // Recipe removed — delete existing if any
    await db.from('recipes').delete().eq('output_item_id', itemId);
  }

  revalidatePath('/admin/items');
}

export async function deleteItem(id: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('item_definitions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/items');
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
