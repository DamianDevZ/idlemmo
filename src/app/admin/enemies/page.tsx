import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminEnemiesPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; q?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = createAdminClient();

  const [{ data: enemies }, { data: areas }] = await Promise.all([
    db
      .from('enemy_types')
      .select('id, name, display_name, tier, level, base_hp, base_attack, xp_reward, area_id')
      .order('tier')
      .order('level'),
    db.from('areas').select('id, display_name, icon, tier').order('tier'),
  ]);

  const filtered = (enemies ?? []).filter(e => {
    const matchesArea = !params.area || e.area_id === params.area;
    const q = params.q?.toLowerCase();
    const matchesQ = !q || e.display_name.toLowerCase().includes(q) || e.name.toLowerCase().includes(q);
    return matchesArea && matchesQ;
  });

  const areaMap = Object.fromEntries((areas ?? []).map(a => [a.id, a]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Enemies</h1>
          <p className="text-sm text-muted-foreground">{enemies?.length ?? 0} enemy types</p>
        </div>
        <Link
          href="/admin/enemies/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Enemy
        </Link>
      </div>

      {/* Filters */}
      <form className="flex gap-3 flex-wrap">
        <input
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Search enemies…"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          name="area"
          defaultValue={params.area ?? ''}
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All areas</option>
          {(areas ?? []).map(a => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.display_name} (T{a.tier})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-1.5 text-sm bg-accent text-accent-foreground rounded-md hover:opacity-90 transition-opacity"
        >
          Filter
        </button>
        {(params.area || params.q) && (
          <Link href="/admin/enemies" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-body transition-colors">
            Clear
          </Link>
        )}
      </form>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-5xl mb-4">👹</p>
          <p className="font-semibold text-heading">No enemies found</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/20 text-muted-foreground text-xs">
                <th className="px-4 py-2.5 text-left font-semibold">Enemy</th>
                <th className="px-4 py-2.5 text-left font-semibold">Area</th>
                <th className="px-4 py-2.5 text-center font-semibold">Tier</th>
                <th className="px-4 py-2.5 text-center font-semibold">Lvl</th>
                <th className="px-4 py-2.5 text-center font-semibold">HP</th>
                <th className="px-4 py-2.5 text-center font-semibold">ATK</th>
                <th className="px-4 py-2.5 text-center font-semibold">XP</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const area = e.area_id ? areaMap[e.area_id] : null;
                return (
                  <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-accent/10 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-heading">{e.display_name}</div>
                      <div className="text-xs text-muted-foreground">{e.name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {area ? `${area.icon} ${area.display_name}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        T{e.tier}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{e.level}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{e.base_hp}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{e.base_attack}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{e.xp_reward}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/admin/enemies/${e.id}`} className="text-xs text-primary hover:underline">
                        Edit →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
