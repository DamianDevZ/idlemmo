import type { SupabaseClient } from '@supabase/supabase-js';

// Maps item type to which skill categories should track that item.
// Materials only get 'refining' if they are raw (material_subtype='raw');
// refined outputs (material_subtype='refined') don't have a mastery category.
const EQUIPMENT_CATEGORIES: Record<string, string[]> = {
  weapon: ['weapon_mastery', 'weapon_crafting'],
  armor:  ['armor_mastery',  'armor_crafting'],
  tool:   ['tool_mastery',   'tool_crafting'],
};

/**
 * Record that one or more items have entered a character's inventory for the
 * first time.  Creates character_item_mastery rows for every relevant category.
 *
 * Safe to call on every inventory add — INSERT uses ON CONFLICT DO NOTHING so
 * subsequent calls for the same item are free no-ops.
 *
 * @param supabase   An authenticated (server-side) Supabase client.
 * @param characterId  UUID of the receiving character.
 * @param itemNames  Array of item_definitions.name values that just entered inventory.
 */
export async function recordItemDiscovery(
  supabase: SupabaseClient,
  characterId: string,
  itemNames: string[],
): Promise<void> {
  // Filter out blanks / coins — only trackable game items needed
  const names = itemNames.filter(n => n && n !== 'coin');
  if (!names.length) return;

  const { data: defs } = await supabase
    .from('item_definitions')
    .select('id, type, material_subtype')
    .in('name', names);

  if (!defs?.length) return;

  const rows: { character_id: string; item_definition_id: string; category_name: string }[] = [];

  for (const def of defs as { id: string; type: string; material_subtype: string | null }[]) {
    if (def.type === 'material') {
      // Only raw materials appear in the Refining skill tab
      if (def.material_subtype === 'raw') {
        rows.push({ character_id: characterId, item_definition_id: def.id, category_name: 'refining' });
      }
    } else {
      const cats = EQUIPMENT_CATEGORIES[def.type] ?? [];
      for (const cat of cats) {
        rows.push({ character_id: characterId, item_definition_id: def.id, category_name: cat });
      }
    }
  }

  if (!rows.length) return;

  // ignoreDuplicates=true maps to ON CONFLICT DO NOTHING
  await supabase
    .from('character_item_mastery')
    .upsert(rows, { onConflict: 'character_id,item_definition_id,category_name', ignoreDuplicates: true });
}
