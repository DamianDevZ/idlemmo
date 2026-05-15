'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

/** Add any item to a player's inventory. Rating optional for equipment. */
export async function adminGiveItem(characterId: string, itemId: string, quantity: number, itemRating?: string) {
  await requireAdmin();
  const db = createAdminClient();

  const { error } = await db.from('character_inventory').insert({
    character_id: characterId,
    item_id: itemId,
    quantity,
    item_rating: itemRating ?? null,
    equipped_slot: null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/players/${characterId}`);
}

/** Remove an inventory instance. */
export async function adminRemoveItem(instanceId: string, characterId: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('character_inventory').delete().eq('instance_id', instanceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/players/${characterId}`);
}

/** Directly set character HP, XP, level, or stamina. */
export async function adminUpdateCharacter(
  characterId: string,
  fields: Partial<{ current_hp: number; current_stamina: number; main_level: number; main_xp: number; skill_points_available: number }>
) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from('characters').update(fields).eq('id', characterId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/players/${characterId}`);
}

/** Set a specific attribute value (1-99). */
export async function adminSetAttribute(characterId: string, attr: string, value: number) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db
    .from('character_attributes')
    .update({ [attr]: value })
    .eq('character_id', characterId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/players/${characterId}`);
}
