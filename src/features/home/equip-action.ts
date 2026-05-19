'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { EquipmentSlot } from '@/types/game';

/** Map item name + type to the correct equipment slot.
 * Prefers the explicit tool_slot column; falls back to name-keyword inference
 * for backward compatibility with tools created before the column existed.
 */
function inferSlot(itemName: string, itemType: string, toolSlot?: string | null): EquipmentSlot | null {
  if (itemType === 'weapon') return 'weapon';
  if (itemType === 'armor')  return 'chest';
  if (itemType === 'tool') {
    // Use the explicit slot if set — avoids relying on name conventions
    if (toolSlot) return toolSlot as EquipmentSlot;
    // Check 'pickaxe' before 'axe' — pickaxe contains 'axe'
    if (itemName.includes('pickaxe')) return 'tool_pickaxe';
    if (itemName.includes('hammer'))  return 'tool_hammer';
    if (itemName.includes('axe'))     return 'tool_axe';
    if (itemName.includes('sickle') || itemName.includes('scythe')) return 'tool_sickle';
    if (itemName.includes('knife'))   return 'tool_knife';
  }
  return null;
}

/**
 * Equip an item. When source='stash', the item is moved from stash into
 * inventory (with equipped_slot set) before equipping.
 */
export async function equipItem(
  characterId: string,
  itemId: string,
  source: 'inventory' | 'stash' = 'inventory',
) {
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

  // Resolve item definition regardless of source
  const { data: itemDef } = await supabase
    .from('item_definitions')
    .select('name, type, tool_slot, required_mastery_skill_id, required_mastery_level')
    .eq('id', itemId)
    .single();
  if (!itemDef) throw new Error('Item definition not found');

  const slot = inferSlot(itemDef.name as string, itemDef.type as string, itemDef.tool_slot as string | null);
  if (!slot) throw new Error('This item cannot be equipped');

  // Enforce mastery level requirement if the item has one
  const masterySkillId = itemDef.required_mastery_skill_id as string | null;
  if (masterySkillId) {
    const requiredLevel = Number(itemDef.required_mastery_level ?? 1);
    const { data: skillRow } = await supabase
      .from('character_skills')
      .select('level')
      .eq('character_id', characterId)
      .eq('skill_id', masterySkillId)
      .maybeSingle();
    const currentLevel = (skillRow as { level?: number } | null)?.level ?? 0;
    if (currentLevel < requiredLevel) {
      throw new Error(`Requires skill level ${requiredLevel} (you have ${currentLevel})`);
    }
  }

  // Unequip whatever is currently in this slot
  await supabase
    .from('character_inventory')
    .update({ equipped_slot: null })
    .eq('character_id', characterId)
    .eq('equipped_slot', slot);

  if (source === 'stash') {
    // Validate item is in stash
    const { data: stashRow } = await supabase
      .from('character_stash')
      .select('quantity')
      .eq('character_id', characterId)
      .eq('item_id', itemId)
      .single();
    if (!stashRow) throw new Error('Item not in stash');

    // Move 1 unit from stash → inventory (equipment is never stackable)
    const remaining = (stashRow.quantity as number) - 1;
    if (remaining === 0) {
      await supabase.from('character_stash').delete()
        .eq('character_id', characterId).eq('item_id', itemId);
    } else {
      await supabase.from('character_stash').update({ quantity: remaining })
        .eq('character_id', characterId).eq('item_id', itemId);
    }

    // Upsert into inventory with the equipped slot
    const { data: existingInv } = await supabase
      .from('character_inventory')
      .select('quantity')
      .eq('character_id', characterId)
      .eq('item_id', itemId)
      .single();

    if (existingInv) {
      await supabase.from('character_inventory')
        .update({ equipped_slot: slot })
        .eq('character_id', characterId).eq('item_id', itemId);
    } else {
      await supabase.from('character_inventory')
        .insert({ character_id: characterId, item_id: itemId, quantity: 1, equipped_slot: slot });
    }
  } else {
    // Validate item is in inventory
    const { data: invRow } = await supabase
      .from('character_inventory')
      .select('item_id')
      .eq('character_id', characterId)
      .eq('item_id', itemId)
      .single();
    if (!invRow) throw new Error('Item not in inventory');

    await supabase.from('character_inventory')
      .update({ equipped_slot: slot })
      .eq('character_id', characterId).eq('item_id', itemId);
  }

  revalidatePath('/game/character');
  revalidatePath('/game/home');
}

/** Remove an equipped item from its slot (sets equipped_slot to null). */
export async function unequipItem(characterId: string, itemId: string) {
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

  await supabase
    .from('character_inventory')
    .update({ equipped_slot: null })
    .eq('character_id', characterId)
    .eq('item_id', itemId);

  revalidatePath('/game/character');
  revalidatePath('/game/home');
}
