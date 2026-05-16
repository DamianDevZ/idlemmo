'use server';

import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * Persist one or more game_config values to the database.
 * Only admin users may call this. Values are validated against the row's
 * min_value / max_value constraints stored in the table itself.
 */
export async function saveConfigValues(
  updates: { key: string; value: number }[]
): Promise<{ error?: string }> {
  await requireAdmin();

  if (!updates.length) return {};

  // Sanitise: reject NaN / Infinity before touching the DB
  for (const u of updates) {
    if (!Number.isFinite(u.value)) {
      return { error: `Invalid value for key "${u.key}": must be a finite number.` };
    }
  }

  const supabase = createAdminClient();

  // Fetch the constraints for every key we are updating so we can validate
  const keys = updates.map(u => u.key);
  const { data: rows, error: fetchErr } = await supabase
    .from('game_config')
    .select('key, min_value, max_value')
    .in('key', keys);

  if (fetchErr) return { error: fetchErr.message };

  const constraintMap = Object.fromEntries((rows ?? []).map(r => [r.key, r]));

  for (const u of updates) {
    const row = constraintMap[u.key];
    if (!row) return { error: `Unknown config key: "${u.key}".` };
    if (row.min_value != null && u.value < Number(row.min_value))
      return { error: `"${u.key}" cannot be less than ${row.min_value}.` };
    if (row.max_value != null && u.value > Number(row.max_value))
      return { error: `"${u.key}" cannot exceed ${row.max_value}.` };
  }

  // Apply all updates sequentially (small batches, so this is fine)
  for (const u of updates) {
    const { error } = await supabase
      .from('game_config')
      .update({ value: u.value, updated_at: new Date().toISOString() })
      .eq('key', u.key);
    if (error) return { error: error.message };
  }

  // Bust the getGameConfig cache so live gameplay picks up the new values
  revalidateTag('game-config', {});

  return {};
}

/**
 * Reset one or more keys to their stored default_value.
 */
export async function resetConfigToDefaults(
  keys: string[]
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!keys.length) return {};

  const supabase = createAdminClient();

  for (const key of keys) {
    const { error } = await supabase.rpc('reset_game_config_to_default', { p_key: key });
    if (error) {
      // Fallback: read default_value then write it back
      const { data, error: readErr } = await supabase
        .from('game_config')
        .select('default_value')
        .eq('key', key)
        .single();
      if (readErr) return { error: readErr.message };
      const { error: writeErr } = await supabase
        .from('game_config')
        .update({ value: data.default_value, updated_at: new Date().toISOString() })
        .eq('key', key);
      if (writeErr) return { error: writeErr.message };
    }
  }

  revalidateTag('game-config', {});
  return {};
}
