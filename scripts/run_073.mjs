import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Update base yields and activate tiered_stats
const { error: e1 } = await sb
  .from('item_definitions')
  .update({})  // placeholder; we'll use raw updates below
  .eq('type', 'not-used');

// Use individual updates since Supabase JS doesn't support jsonb concat directly
const { data: tools } = await sb
  .from('item_definitions')
  .select('id, display_name, tool_config, tiered_stats')
  .eq('type', 'tool');

for (const tool of tools) {
  const newConfig = { ...tool.tool_config, yield_min: 5, yield_max: 5 };
  const stats = Array.from(new Set([...(tool.tiered_stats ?? []), 'yield_min', 'yield_max'])).sort();
  const { error } = await sb
    .from('item_definitions')
    .update({ tool_config: newConfig, tiered_stats: stats })
    .eq('id', tool.id);
  console.log(`${tool.display_name}: ${error ? error.message : 'base updated'}`);
}

// 2. Update tier scaling multipliers (linear 1.0 → 0.04)
const mults = {
  1: 1.0000, 2: 0.8933, 3: 0.7867, 4: 0.6800, 5: 0.5733,
  6: 0.4667, 7: 0.3600, 8: 0.2533, 9: 0.1467, 10: 0.0400,
};

for (const stat_key of ['yield_min', 'yield_max']) {
  for (const [tier, multiplier] of Object.entries(mults)) {
    const { error } = await sb
      .from('tier_scaling_config')
      .update({ multiplier })
      .eq('item_type', 'tool')
      .eq('stat_key', stat_key)
      .eq('tier', Number(tier));
    if (error) console.log(`scaling ${stat_key} T${tier}: ${error.message}`);
  }
}
console.log('Scaling updated. Final check:');

const { data: check } = await sb
  .from('tier_scaling_config')
  .select('stat_key, tier, multiplier')
  .eq('item_type', 'tool')
  .in('stat_key', ['yield_min', 'yield_max'])
  .order('stat_key').order('tier');

for (const r of check) {
  console.log(`  ${r.stat_key} T${r.tier}: ${r.multiplier}x → ${(5 * r.multiplier).toFixed(2)} items`);
}
