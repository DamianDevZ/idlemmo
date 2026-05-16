'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Move all of an item from the character's inventory into the home stash.
 * If the stash already has some of that item, the quantities are merged.
 */
export async function depositToStash(characterId: string, itemId: string) {
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

  // Collect ALL unequipped inventory rows for this item and sum them.
  // Using select-all instead of .single() guards against any leftover duplicate rows.
  const { data: invRows } = await supabase
    .from('character_inventory')
    .select('instance_id, quantity')
    .eq('character_id', characterId)
    .eq('item_id', itemId)
    .is('equipped_slot', null);

  const totalQty = (invRows ?? []).reduce((sum, r) => sum + (r.quantity as number), 0);
  if (totalQty <= 0) return;

  // Fetch existing stash row to merge quantities
  const { data: stashRow } = await supabase
    .from('character_stash')
    .select('quantity')
    .eq('character_id', characterId)
    .eq('item_id', itemId)
    .maybeSingle();

  const newStashQty = (stashRow?.quantity ?? 0) + totalQty;

  // Upsert stash — unique constraint on (character_id, item_id) handles the merge
  const { error: stashErr } = await supabase
    .from('character_stash')
    .upsert(
      { character_id: characterId, item_id: itemId, quantity: newStashQty },
      { onConflict: 'character_id,item_id' }
    );
  if (stashErr) throw new Error(stashErr.message);

  // Remove from inventory by instance_id so we never accidentally touch equipped items
  const instanceIds = (invRows ?? []).map(r => r.instance_id as string);
  if (instanceIds.length > 0) {
    await supabase
      .from('character_inventory')
      .delete()
      .in('instance_id', instanceIds);
  }

  revalidatePath('/game/home');
}

/**
 * Move every unequipped item from the character's inventory into the stash.
 * Quantities are merged with anything already in the stash.
 */
export async function depositAllToStash(characterId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!character) throw new Error('Character not found');

  // Only deposit unequipped items
  const { data: invRows } = await supabase
    .from('character_inventory')
    .select('instance_id, item_id, quantity')
    .eq('character_id', characterId)
    .is('equipped_slot', null);

  if (!invRows || invRows.length === 0) return;

  // Aggregate quantities by item_id in case there are any leftover duplicate rows
  const itemTotals = new Map<string, number>();
  for (const row of invRows) {
    const id = row.item_id as string;
    itemTotals.set(id, (itemTotals.get(id) ?? 0) + (row.quantity as number));
  }

  // Fetch existing stash to compute merged totals
  const { data: stashRows } = await supabase
    .from('character_stash')
    .select('item_id, quantity')
    .eq('character_id', characterId);

  const stashMap = new Map((stashRows ?? []).map(r => [r.item_id as string, r.quantity as number]));

  const upsertPayload = Array.from(itemTotals.entries()).map(([item_id, qty]) => ({
    character_id: characterId,
    item_id,
    quantity: (stashMap.get(item_id) ?? 0) + qty,
  }));

  const { error: stashErr } = await supabase
    .from('character_stash')
    .upsert(upsertPayload, { onConflict: 'character_id,item_id' });
  if (stashErr) throw new Error(stashErr.message);

  // Delete the deposited inventory rows by instance_id (precise — never touches equipped items)
  const instanceIds = invRows.map(r => r.instance_id as string);
  await supabase
    .from('character_inventory')
    .delete()
    .in('instance_id', instanceIds);

  revalidatePath('/game/home');
}
