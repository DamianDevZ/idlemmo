import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AreaForm } from '@/components/admin/AreaForm';

export const dynamic = 'force-dynamic';

const BLANK = {
  name: '', display_name: '', tier: 1, description: '', icon: '🗺️', sort_order: 0,
};

export default async function AreaEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === 'new';
  const db = createAdminClient();

  const [{ data: biomes }, { data: items }] = await Promise.all([
    db.from('biomes').select('id, name, display_name, icon').order('name'),
    db.from('item_definitions').select('id, display_name, type, name').order('display_name'),
  ]);

  let area = BLANK;
  type AreaBiome = {
    id: string;
    biome_id: string;
    area_biome_loot: {
      id: string;
      item_id: string;
      weight: number;
      quantity_min: number;
      quantity_max: number;
      gather_time_ms: number;
      required_skill_name: string | null;
    }[];
  };
  let areaBiomes: AreaBiome[] = [];

  if (!isNew) {
    const { data: areaData } = await db
      .from('areas')
      .select('name, display_name, tier, description, icon, sort_order')
      .eq('id', id)
      .single();
    if (!areaData) notFound();
    area = areaData;

    const { data: biomesData } = await db
      .from('area_biomes')
      .select('id, biome_id, area_biome_loot(id, item_id, weight, quantity_min, quantity_max, gather_time_ms, required_skill_name)')
      .eq('area_id', id);
    areaBiomes = (biomesData ?? []) as AreaBiome[];
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
        initial={area}
        allBiomes={(biomes ?? []) as { id: string; name: string; display_name: string; icon: string }[]}
        areaBiomes={areaBiomes}
        allItems={(items ?? []) as { id: string; display_name: string; type: string; name: string }[]}
      />
    </div>
  );
}
