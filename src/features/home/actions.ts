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

  // Fetch both rows in parallel
  const [{ data: invRow }, { data: stashRow }] = await Promise.all([
    supabase
      .from('character_inventory')
      .select('quantity')
      .eq('character_id', characterId)
      .eq('item_id', itemId)
      .single(),
    supabase
      .from('character_stash')
      .select('quantity')
      .eq('character_id', characterId)
      .eq('item_id', itemId)
      .maybeSingle(),
  ]);

  if (!invRow || invRow.quantity <= 0) return; // nothing to deposit

  const newStashQty = (stashRow?.quantity ?? 0) + invRow.quantity;

  // Upsert stash with merged quantity
  const { error: stashErr } = await supabase
    .from('character_stash')
    .upsert(
      { character_id: characterId, item_id: itemId, quantity: newStashQty },
      { onConflict: 'character_id,item_id' }
    );
  if (stashErr) throw new Error(stashErr.message);

  // Remove from inventory
  await supabase
    .from('character_inventory')
    .delete()
    .eq('character_id', characterId)
    .eq('item_id', itemId);

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
    .select('item_id, quantity')
    .eq('character_id', characterId)
    .is('equipped_slot', null);

  if (!invRows || invRows.length === 0) return;

  // Fetch existing stash to compute merged totals
  const { data: stashRows } = await supabase
    .from('character_stash')
    .select('item_id, quantity')
    .eq('character_id', characterId);

  const stashMap = new Map((stashRows ?? []).map(r => [r.item_id as string, r.quantity as number]));

  const upsertPayload = invRows.map(row => ({
    character_id: characterId,
    item_id: row.item_id as string,
    quantity: (stashMap.get(row.item_id as string) ?? 0) + (row.quantity as number),
  }));

  const { error: stashErr } = await supabase
    .from('character_stash')
    .upsert(upsertPayload, { onConflict: 'character_id,item_id' });
  if (stashErr) throw new Error(stashErr.message);

  await supabase
    .from('character_inventory')
    .delete()
    .eq('character_id', characterId)
    .in('item_id', invRows.map(r => r.item_id));

  revalidatePath('/game/home');
}
