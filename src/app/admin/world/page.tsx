import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WorldPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [{ data: areas }, { data: biomeCounts }] = await Promise.all([
    db.from('areas')
      .select('id, name, display_name, tier, description, icon, sort_order')
      .order('sort_order')
      .order('tier'),
    db.from('area_biomes').select('area_id'),
  ]);

  const biomeCountMap: Record<string, number> = {};
  for (const row of biomeCounts ?? []) {
    biomeCountMap[row.area_id] = (biomeCountMap[row.area_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">World — Areas</h1>
          <p className="text-sm text-muted-foreground">{areas?.length ?? 0} areas defined</p>
        </div>
        <Link
          href="/admin/world/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Area
        </Link>
      </div>

      {(!areas || areas.length === 0) && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-5xl mb-4">🗺️</p>
          <p className="font-semibold text-heading">No areas yet</p>
          <p className="text-sm mt-1">Create your first area to start building the world.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(areas ?? []).map(area => (
          <Link
            key={area.id}
            href={`/admin/world/${area.id}`}
            className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all flex flex-col gap-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{area.icon}</span>
                <div>
                  <h3 className="font-bold text-heading">{area.display_name}</h3>
                  <p className="text-xs text-muted-foreground">{area.name}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                T{area.tier}
              </span>
            </div>

            {area.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{area.description}</p>
            )}

            <div className="flex items-center justify-between text-xs mt-auto">
              <span className="text-muted-foreground">
                {biomeCountMap[area.id] ?? 0} biome{biomeCountMap[area.id] !== 1 ? 's' : ''}
              </span>
              <span className="text-muted-foreground group-hover:text-primary transition-colors">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
