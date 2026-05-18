import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AreaForm } from '@/components/admin/AreaForm';

export const dynamic = 'force-dynamic';

const BLANK = {
  name: '', display_name: '', description: '', icon: '🗺️', sort_order: 0,
};

export default async function AreaEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === 'new';
  const db = createAdminClient();

  let items: { id: string; display_name: string; type: string; name: string; is_tiered: boolean }[] = [];
  let maxTier = 5;
  let allEnemies: { id: string; display_name: string; icon: string }[] = [];

  try {
    const [itemsResult, maxTierResult, enemiesResult] = await Promise.all([
      db.from('item_definitions').select('id, display_name, type, name, is_tiered').order('display_name'),
      db.from('game_config').select('value').eq('key', 'max_tier').maybeSingle(),
      db.from('enemies').select('id, display_name, icon').order('display_name'),
    ]);
    items = (itemsResult.data ?? []) as typeof items;
    maxTier = Number((maxTierResult.data as { value: number } | null)?.value ?? 5) || 5;
    allEnemies = (enemiesResult.data ?? []) as typeof allEnemies;
  } catch (e) {
    console.error('[world/[id]] setup query failed:', e);
  }

  let area: { name: string; display_name: string; description: string; icon: string; sort_order: number; image_url: string | null } = { ...BLANK, image_url: null };
  type TierLootRow = {
    id: string;
    tier: number;
    item_id: string;
    item_tier: number | null;
    weight: number;
  };
  type EncounterRow = { id: string; tier: number; enemy_id: string; weight: number };
  let lootRows: TierLootRow[] = [];
  let encounterRows: EncounterRow[] = [];

  if (!isNew) {
    try {
      const { data: areaData } = await db
      .from('areas')
      .select('name, display_name, description, icon, sort_order, image_url')
      .eq('id', id)
      .single();
      if (!areaData) notFound();
      area = areaData;

      const [lootResult, encResult] = await Promise.all([
        db.from('area_tier_loot')
          .select('id, tier, item_id, item_tier, weight')
          .eq('area_id', id)
          .order('tier')
          .order('weight', { ascending: false }),
        db.from('area_tier_enemies')
          .select('id, tier, enemy_id, weight')
          .eq('area_id', id)
          .order('tier')
          .order('weight', { ascending: false }),
      ]);
      lootRows = (lootResult.data ?? []) as TierLootRow[];
      encounterRows = (encResult.data ?? []) as EncounterRow[];
    } catch (e) {
      console.error('[world/[id]] area query failed:', e);
      notFound();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/world" className="text-sm text-muted-foreground hover:text-body transition-colors">
          ← World
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-heading">{isNew ? 'New Area' : area.display_name}</h1>
      </div>

      <AreaForm
        areaId={isNew ? null : id}
        initial={{ name: area.name, display_name: area.display_name, description: area.description, icon: area.icon, sort_order: area.sort_order }}
        lootRows={lootRows}
        encounterRows={encounterRows}
        allItems={(items ?? []) as { id: string; display_name: string; type: string; name: string; is_tiered: boolean }[]}
        allEnemies={allEnemies}
        maxTier={maxTier}
        imageUrl={area.image_url}
      />
    </div>
  );
}


