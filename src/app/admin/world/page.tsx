import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WorldPage() {
  await requireAdmin();
  const db = createAdminClient();

  const { data: areas } = await db
    .from('areas')
    .select('id, name, display_name, description, icon, sort_order')
    .order('sort_order');

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
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none">{area.icon}</span>
              <div>
                <h3 className="font-bold text-heading">{area.display_name}</h3>
                <p className="text-xs text-muted-foreground">{area.name}</p>
              </div>
            </div>

            {area.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{area.description}</p>
            )}

            <div className="flex items-center justify-end text-xs mt-auto">
              <span className="text-muted-foreground group-hover:text-primary transition-colors">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
