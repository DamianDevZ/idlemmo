'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Bind a special-attack scroll to the character's currently-equipped weapon.
 * The scroll item must be in the character's inventory (unequipped).
 * The weapon must be equipped and, if the scroll specifies compatible weapon types,
 * the weapon's type must match.
 */
export async function bindUltimate(
  characterId: string,
  scrollItemId: string,       // item_definitions.id of the special_attack item
  weaponInstanceId: string,   // character_inventory.instance_id of the equipped weapon
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  // 1. Verify the character belongs to this user
  const { data: char } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!char) return { ok: false, error: 'Character not found' };

  // 2. Fetch the scroll item definition (compatible_weapon_type_ids)
  const { data: scrollDef } = await supabase
    .from('item_definitions')
    .select('id, name, compatible_weapon_type_ids')
    .eq('id', scrollItemId)
    .eq('type', 'special_attack')
    .single() as { data: { id: string; name: string; compatible_weapon_type_ids: string[] | null } | null };
  if (!scrollDef) return { ok: false, error: 'Scroll not found' };

  // 3. Verify the scroll is in this character's inventory
  const { data: scrollInv } = await supabase
    .from('character_inventory')
    .select('instance_id')
    .eq('character_id', characterId)
    .eq('item_id', scrollItemId)
    .is('equipped_slot', null)
    .single();
  if (!scrollInv) return { ok: false, error: 'Scroll not in inventory' };

  // 4. Fetch the equipped weapon and its weapon_type_id
  const { data: weaponInv } = await supabase
    .from('character_inventory')
    .select('instance_id, item_definitions(weapon_type_id)')
    .eq('character_id', characterId)
    .eq('instance_id', weaponInstanceId)
    .not('equipped_slot', 'is', null)
    .single() as {
      data: { instance_id: string; item_definitions: { weapon_type_id: string | null } | null } | null
    };
  if (!weaponInv) return { ok: false, error: 'Weapon not equipped' };

  const weaponTypeId = weaponInv.item_definitions?.weapon_type_id ?? null;

  // 5. Check compatibility
  const compatible = scrollDef.compatible_weapon_type_ids;
  if (compatible && compatible.length > 0 && weaponTypeId && !compatible.includes(weaponTypeId)) {
    return { ok: false, error: 'Scroll is not compatible with this weapon type' };
  }

  // 6. Ensure a special_attack_scrolls entry exists for this item
  const { data: existingScroll } = await supabase
    .from('special_attack_scrolls')
    .select('id')
    .eq('item_id', scrollItemId)
    .maybeSingle();

  let scrollId: string;
  if (existingScroll) {
    scrollId = existingScroll.id;
  } else {
    // Create a minimal scroll row — rage_cost defaults to 100, no components
    const { data: newScroll, error: scrollErr } = await supabase
      .from('special_attack_scrolls')
      .insert({ item_id: scrollItemId, rage_cost: 100, components: [] })
      .select('id')
      .single();
    if (scrollErr || !newScroll) return { ok: false, error: 'Failed to register scroll' };
    scrollId = newScroll.id;
  }

  // 7. Upsert the binding (one ultimate per character at a time)
  const { error: bindErr } = await supabase
    .from('character_special_attacks')
    .upsert(
      { character_id: characterId, scroll_id: scrollId, bound_instance_id: weaponInstanceId },
      { onConflict: 'character_id,scroll_id' },
    );
  if (bindErr) return { ok: false, error: bindErr.message };

  return { ok: true };
}

/**
 * Unbind a special-attack scroll from whatever weapon it is bound to.
 */
export async function unbindUltimate(
  characterId: string,
  scrollId: string,           // special_attack_scrolls.id
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: char } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();
  if (!char) return { ok: false, error: 'Character not found' };

  const { error } = await supabase
    .from('character_special_attacks')
    .delete()
    .eq('character_id', characterId)
    .eq('scroll_id', scrollId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
