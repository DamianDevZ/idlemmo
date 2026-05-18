import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Enemy = { id: string; name: string; display_name: string; icon: string; sort_order: number };
type Area  = { id: string; display_name: string; icon: string; tier: number };

function EnemyTable({ enemies, areaId }: { enemies: Enemy[]; areaId?: string }) {
  if (enemies.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground italic">
        No enemies assigned here.{' '}
        <Link href={`/admin/enemies/new${areaId ? `?from_area=${areaId}` : ''}`} className="text-primary hover:underline">
          Create one →
        </Link>
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {enemies.map(e => (
          <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-accent/10 transition-colors">
            <td className="px-4 py-2.5 w-8 text-base">{e.icon}</td>
            <td className="px-4 py-2.5 font-medium text-heading">{e.display_name}</td>
            <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{e.name}</td>
            <td className="px-4 py-2.5 text-right">
              <Link href={`/admin/enemies/${e.id}`} className="text-xs text-primary hover:underline">
                Edit →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AdminEnemiesPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [enemiesResult, areasResult, assignmentsResult] = await Promise.all([
    db.from('enemies').select('id, name, display_name, icon, sort_order').order('sort_order').order('display_name'),
    db.from('areas').select('id, display_name, icon, tier').order('sort_order').order('display_name'),
    db.from('area_tier_enemies').select('area_id, enemy_id'),
  ]);

  const enemies  = (enemiesResult.data  ?? []) as Enemy[];
  const areas    = (areasResult.data    ?? []) as Area[];
  // Deduplicate: one entry per (area_id, enemy_id) pair — ignore tier/weight here
  const assignments = assignmentsResult.data ?? [];
  const assignedEnemyIds = new Set(assignments.map(a => a.enemy_id as string));

  // Build per-area enemy lists (deduped by enemy_id within each area)
  const enemiesByArea: Record<string, Enemy[]> = {};
  for (const area of areas) {
    const areaEnemyIds = new Set(
      assignments.filter(a => a.area_id === area.id).map(a => a.enemy_id as string)
    );
    enemiesByArea[area.id] = enemies.filter(e => areaEnemyIds.has(e.id));
  }
  const unassigned = enemies.filter(e => !assignedEnemyIds.has(e.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Enemies</h1>
          <p className="text-sm text-muted-foreground">{enemies.length} enemy types across {areas.length} areas</p>
        </div>
        <Link
          href="/admin/enemies/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Enemy
        </Link>
      </div>

      {enemies.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-5xl mb-4">👹</p>
          <p className="font-semibold text-heading">No enemies yet</p>
          <p className="text-sm mt-1">Create your first enemy to get started.</p>
        </div>
      )}

      {areas.map(area => (
        <div key={area.id} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-accent/10">
            <div className="flex items-center gap-2">
              <span className="text-lg">{area.icon}</span>
              <span className="font-semibold text-heading">{area.display_name}</span>
              <span className="text-xs text-muted-foreground">T{area.tier}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{enemiesByArea[area.id]?.length ?? 0} enemies</span>
              <Link
                href={`/admin/enemies/new?from_area=${area.id}`}
                className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
              >
                + New Enemy
              </Link>
              <Link href={`/admin/world/${area.id}`} className="text-xs text-muted-foreground hover:text-body">
                Edit area →
              </Link>
            </div>
          </div>
          <EnemyTable enemies={enemiesByArea[area.id] ?? []} areaId={area.id} />
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-accent/10">
            <span className="font-semibold text-muted-foreground text-sm">Unassigned</span>
            <span className="ml-2 text-xs text-muted-foreground">not in any area yet</span>
          </div>
          <EnemyTable enemies={unassigned} />
        </div>
      )}
    </div>
  );
}

