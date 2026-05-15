import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

const TYPE_COLORS: Record<string, string> = {
  weapon: 'text-red-400',
  armor: 'text-blue-400',
  tool: 'text-amber-400',
  material: 'text-green-400',
  consumable: 'text-purple-400',
  misc: 'text-muted-foreground',
  special_attack: 'text-orange-400',
};

const RARITY_COLORS: Record<string, string> = {
  common: 'text-body',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-amber-400',
};

export default async function AdminItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = createAdminClient();

  let query = db
    .from('item_definitions')
    .select('id, name, display_name, type, rarity, equipment_tier, base_damage, base_defense, primary_damage_type, stackable, image_url')
    .order('type')
    .order('display_name');

  if (params.type) query = query.eq('type', params.type);
  if (params.q) query = query.ilike('display_name', `%${params.q}%`);

  const { data: items } = await query;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-heading">Items</h1>
          <p className="text-sm text-muted-foreground">{items?.length ?? 0} definitions</p>
        </div>
        <Link
          href="/admin/items/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Item
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-2 flex-wrap">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search name…"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          name="type"
          defaultValue={params.type ?? ''}
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All types</option>
          {['weapon','armor','tool','material','consumable','misc','special_attack'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button type="submit" className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body hover:bg-accent transition-colors">
          Filter
        </button>
        <Link href="/admin/items" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-body transition-colors">
          Clear
        </Link>
      </form>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Icon</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rarity</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stats</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-accent/10'}`}>
                <td className="px-4 py-2">
                  {item.image_url
                    ? <img src={item.image_url} alt="" className="w-7 h-7 rounded object-cover" />
                    : <span className="w-7 h-7 rounded bg-accent flex items-center justify-center text-xs text-muted-foreground">?</span>
                  }
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-heading">{item.display_name}</div>
                  <div className="text-xs text-muted-foreground">{item.name}</div>
                </td>
                <td className="px-4 py-2">
                  <span className={`font-medium ${TYPE_COLORS[item.type] ?? ''}`}>{item.type}</span>
                </td>
                <td className="px-4 py-2">
                  <span className={RARITY_COLORS[item.rarity] ?? ''}>{item.rarity}</span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {item.equipment_tier ? `T${item.equipment_tier}` : '—'}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {item.base_damage != null && `⚔ ${item.base_damage} dmg${item.primary_damage_type ? ` (${item.primary_damage_type})` : ''}`}
                  {item.base_defense != null && `🛡 ${item.base_defense} def`}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/admin/items/${item.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!items || items.length === 0) && (
          <div className="py-12 text-center text-muted-foreground text-sm">No items found</div>
        )}
      </div>
    </div>
  );
}
