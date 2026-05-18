import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ExploreClient from '@/components/game/ExploreClient';
import type { DbBiome, DbBiomeTier, DbCharacter, DbCharacterAttributes, DbExplorationSession, DbInventoryItem, DbItemDefinition } from '@/types/game';
export const dynamic = 'force-dynamic';

export default async function ExplorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: character } = await supabase
    .from('characters')
    .select('*, character_attributes(*)')
    .eq('user_id', user.id)
    .single();

  if (!character) redirect('/game/create-character');

  const [
    { data: biomes },
    { data: biomeTiers },
    { data: charSkills },
    { data: skills },
    { data: equippedTools },
    { data: consumableInventory },
    { data: areas },
  ] = await Promise.all([
    supabase.from('biomes').select('*').neq('name', 'ocean').order('sort_order'),
    supabase.from('biome_tiers').select('*').order('tier'),
    supabase.from('character_skills').select('skill_id, level').eq('character_id', character.id),
    supabase.from('skills').select('id, name'),
    supabase
      .from('character_inventory')
      .select('item_definitions(equipment_tier)')
      .eq('character_id', character.id)
      .not('equipped_slot', 'is', null),
    supabase
      .from('character_inventory')
      .select('instance_id, quantity, item_definitions(name, display_name, type, stats, image_url)')
      .eq('character_id', character.id)
      .is('equipped_slot', null),
    supabase
      .from('areas')
      .select('id, name, display_name, description, icon, sort_order, image_url')
      .order('sort_order'),
  ]);

  // Build skill_name → level map
  const skillIdToName = new Map((skills ?? []).map(s => [s.id, s.name]));
  const characterSkills: Record<string, number> = {};
  for (const cs of charSkills ?? []) {
    const name = skillIdToName.get(cs.skill_id);
    if (name) characterSkills[name] = cs.level;
  }

  // Player's highest equipped tool tier (0 = no tool)
  const playerToolTier = Math.max(
    0,
    ...((equippedTools ?? []).map(row => {
      const def = row.item_definitions as { equipment_tier?: number | null } | null;
      return def?.equipment_tier ?? 0;
    }))
  );

  const { data: activeSession } = await supabase
    .from('exploration_sessions')
    .select('*')
    .eq('character_id', character.id)
    .eq('status', 'active')
    .single();

  const { data: recentEvents } = await supabase
    .from('exploration_events')
    .select('*')
    .eq('character_id', character.id)
    .order('occurred_at', { ascending: false })
    .limit(20);

  // Filter to consumables only
  type RawConsumable = {
    instance_id: string;
    quantity: number;
    item_definitions: { name: string; display_name: string; type: string; stats: Record<string, number>; image_url: string | null } | null;
  };
  const consumables = ((consumableInventory ?? []) as unknown as RawConsumable[])
    .filter(row => row.item_definitions?.type === 'consumable' && (row.item_definitions.stats?.heal_amount ?? 0) > 0)
    .map(row => ({
      instance_id:      row.instance_id,
      quantity:         row.quantity,
      item_definitions: row.item_definitions!,
    }));

  return (
    <ExploreClient
      character={character as DbCharacter & { character_attributes: DbCharacterAttributes }}
      areas={(areas ?? []) as { id: string; name: string; display_name: string; description: string; icon: string; sort_order: number; image_url: string | null }[]}
      biomes={(biomes ?? []) as DbBiome[]}
      biomeTiers={(biomeTiers ?? []) as DbBiomeTier[]}
      activeSession={(activeSession ?? null) as DbExplorationSession | null}
      initialEvents={recentEvents ?? []}
      characterSkills={characterSkills}
      playerToolTier={playerToolTier}
      initialConsumables={consumables}
    />
  );
}
