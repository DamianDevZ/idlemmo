import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

// ── Config ─────────────────────────────────────────────────────────────────
const ITEM_TYPES = [
  { key: 'weapon',         label: 'Weapons',     emoji: '⚔️' },
  { key: 'armor',          label: 'Armor',       emoji: '🛡️' },
  { key: 'tool',           label: 'Tools',       emoji: '⛏️' },
  { key: 'material',       label: 'Materials',   emoji: '🪨' },
  { key: 'consumable',     label: 'Consumables', emoji: '🧪' },
  { key: 'misc',           label: 'Misc',        emoji: '📦' },
  { key: 'special_attack', label: 'Specials',    emoji: '✨' },
] as const;

const RARITY_ORDER = ['common','uncommon','rare','epic','legendary'];
const RARITY_HEX: Record<string,string> = {
  common:'#64748b', uncommon:'#22c55e', rare:'#3b82f6', epic:'#a855f7', legendary:'#f59e0b',
};
const SCALING_HEX: Record<string,string> = {
  str:'#ef4444', dex:'#22c55e', int:'#3b82f6',
  fth:'#f59e0b', arc:'#a855f7', vig:'#ec4899', end:'#06b6d4',
};
const TYPE_TEXT: Record<string,string> = {
  weapon:'text-red-400', armor:'text-blue-400', tool:'text-amber-400',
  material:'text-green-400', consumable:'text-purple-400', misc:'text-muted-foreground', special_attack:'text-orange-400',
};
const DMG_COLORS: Record<string, string> = {
  slash: '#ef4444', pierce: '#f97316', blunt: '#f59e0b', bleed: '#ec4899',
  fire: '#fb923c', ice: '#06b6d4', lightning: '#facc15', poison: '#4ade80',
  physical: '#f87171', magical: '#a78bfa', holy: '#fde68a', dark: '#7c3aed',
};
const DMG_FALLBACK = ['#94a3b8','#64748b','#475569','#334155'];

// ── SVG Donut (pure, server-renderable) ────────────────────────────────────
type Seg = { label: string; value: number; color: string };

function DonutChart({ segs, title, center }: { segs: Seg[]; title: string; center: string }) {
  const r = 36, sw = 13, circ = 2 * Math.PI * r;
  const sum = segs.reduce((a, s) => a + s.value, 0);
  let cum = 0;
  const arcs = segs.filter(s => s.value > 0).map(s => {
    const startAngle = (cum / sum) * 360 - 90;
    const dashLen = (s.value / sum) * circ;
    cum += s.value;
    return { ...s, dashLen, startAngle };
  });
  return (
    <div className="flex flex-col items-center gap-2 min-w-[120px]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">{title}</p>
      <div className="relative w-[88px] h-[88px] shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {sum === 0 ? (
            <circle cx={50} cy={50} r={r} fill="none" strokeWidth={sw} className="stroke-border" />
          ) : arcs.map((arc, i) => (
            <circle key={i} cx={50} cy={50} r={r} fill="none"
              stroke={arc.color} strokeWidth={sw}
              strokeDasharray={`${arc.dashLen} ${circ - arc.dashLen}`}
              transform={`rotate(${arc.startAngle}, 50, 50)`} />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-heading leading-none">{center}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 w-full">
        {segs.map(s => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-muted-foreground capitalize">{s.label}</span>
            <span className="ml-auto font-mono text-body">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

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
  searchParams: Promise<{ type?: string; q?: string; sort?: string; rarity?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = createAdminClient();

  // ── CARD OVERVIEW ────────────────────────────────────────────────────────
  if (!params.type) {
    const { data: all } = await db
      .from('item_definitions')
      .select('id, type, rarity, primary_damage_type, primary_scaling_attr, secondary_scaling_attr, material_type');

    const rows = all ?? [];
    const byType: Record<string, typeof rows> = {};
    for (const item of rows) (byType[item.type] ??= []).push(item);

    // Pre-compute weapon aggregations
    const weapons = byType['weapon'] ?? [];

    // Damage type: tally actual values + show unset weapons as grey so donut is proportional
    const dmgTally: Record<string, number> = {};
    let dmgUnset = 0;
    for (const w of weapons) {
      if (w.primary_damage_type) dmgTally[w.primary_damage_type] = (dmgTally[w.primary_damage_type] ?? 0) + 1;
      else dmgUnset++;
    }
    const weaponDmgSegs: Seg[] = [
      ...Object.entries(dmgTally)
        .sort((a, b) => b[1] - a[1])
        .map(([t, v], i) => ({ label: t, value: v, color: DMG_COLORS[t] ?? DMG_FALLBACK[i % DMG_FALLBACK.length] })),
      ...(dmgUnset > 0 ? [{ label: 'unset', value: dmgUnset, color: '#334155' }] : []),
    ];

    // Attr scaling: count weapons per attr (primary or secondary); unset = no scaling defined
    const scalingTally: Record<string, number> = {};
    let scalingUnset = 0;
    for (const w of weapons) {
      if (!w.primary_scaling_attr && !w.secondary_scaling_attr) { scalingUnset++; continue; }
      if (w.primary_scaling_attr) scalingTally[w.primary_scaling_attr] = (scalingTally[w.primary_scaling_attr] ?? 0) + 1;
      if (w.secondary_scaling_attr && w.secondary_scaling_attr !== w.primary_scaling_attr)
        scalingTally[w.secondary_scaling_attr] = (scalingTally[w.secondary_scaling_attr] ?? 0) + 1;
    }
    const scalingSegs: Seg[] = [
      ...Object.entries(scalingTally)
        .map(([a, v]) => ({ label: a, value: v, color: SCALING_HEX[a] ?? '#94a3b8' }))
        .sort((a, b) => b.value - a.value),
      ...(scalingUnset > 0 ? [{ label: 'unset', value: scalingUnset, color: '#334155' }] : []),
    ];

    // Armor material aggregation
    const armors = byType['armor'] ?? [];
    const matTally: Record<string, number> = {};
    for (const a of armors) { const m = a.material_type ?? 'other'; matTally[m] = (matTally[m] ?? 0) + 1; }
    const matColors = ['#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#94a3b8'];
    const matSegs: Seg[] = Object.entries(matTally).map(([m, v], i) => ({ label: m, value: v, color: matColors[i % matColors.length] }));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-heading">Items</h1>
            <p className="text-sm text-muted-foreground">{rows.length} total item definitions</p>
          </div>
          <Link href="/admin/items/new"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            + New Item
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ITEM_TYPES.map(tc => {
            const items = byType[tc.key] ?? [];
            const count = items.length;
            const raritySegs: Seg[] = RARITY_ORDER
              .map(r => ({ label: r, value: items.filter(i => i.rarity === r).length, color: RARITY_HEX[r] }))
              .filter(s => s.value > 0);

            return (
              <Link key={tc.key} href={`/admin/items?type=${tc.key}`}
                className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all cursor-pointer flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">{tc.emoji}</span>
                    <div>
                      <h3 className="font-bold text-heading leading-tight">{tc.label}</h3>
                      <p className="text-xs text-muted-foreground">{count} items</p>
                    </div>
                  </div>
                  <span className="text-muted-foreground group-hover:text-primary transition-colors">→</span>
                </div>

                {tc.key === 'weapon' ? (
                  <div className="flex gap-3 justify-center flex-wrap">
                    <DonutChart segs={weaponDmgSegs} title="Damage Type" center={`${count}`} />
                    <DonutChart segs={scalingSegs} title="Attr Scaling" center={`${count}`} />
                  </div>
                ) : tc.key === 'armor' ? (
                  <div className="flex justify-center">
                    <DonutChart segs={matSegs} title="Material" center={`${count}`} />
                  </div>
                ) : raritySegs.length > 0 ? (
                  <div className="flex justify-center">
                    <DonutChart segs={raritySegs} title="Rarity" center={`${count}`} />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center py-4">
                    <span className="text-4xl font-black text-heading opacity-10">{count}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        {/* System legend */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">System Key</p>
          <div className="flex flex-wrap gap-6 text-xs">
            <div>
              <p className="font-semibold text-body mb-1">Rarity — base drop chance of the item definition</p>
              <div className="flex gap-3 flex-wrap">
                {[['common','most common'],['uncommon',''],['rare',''],['epic',''],['legendary','rarest']].map(([r, note]) => (
                  <span key={r} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: RARITY_HEX[r] }} />
                    <span style={{ color: RARITY_HEX[r] }}>{r}</span>
                    {note && <span className="text-muted-foreground">({note})</span>}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="font-semibold text-body mb-1">Rating — quality of a specific dropped instance</p>
              <div className="flex items-center gap-2">
                {['S','A','B','C','D','F'].map(r => (
                  <span key={r} className="font-bold text-amber-400">{r}</span>
                ))}
                <span className="text-muted-foreground">← S is best, F is worst</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST MODE ───────────────────────────────────────────────────────────
  const { type: typeKey, q, sort, rarity } = params;
  const tc = ITEM_TYPES.find(t => t.key === typeKey);

  let query = db
    .from('item_definitions')
    .select('id, name, display_name, type, rarity, equipment_tier, base_damage, base_defense, primary_damage_type, stackable, image_url, primary_scaling_attr, secondary_scaling_attr, material_type')
    .eq('type', typeKey!);
  if (q) query = query.ilike('display_name', `%${q}%`);
  if (rarity) query = query.eq('rarity', rarity);
  if (sort !== 'rarity') query = query.order(sort === 'tier' ? 'equipment_tier' : 'display_name');

  const { data: rawItems } = await query;
  const items = sort === 'rarity'
    ? [...(rawItems ?? [])].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
    : rawItems ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/admin/items" className="text-sm text-muted-foreground hover:text-body transition-colors">← Overview</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-bold text-heading">{tc?.emoji} {tc?.label ?? typeKey}</h1>
          <span className="text-sm text-muted-foreground">{items.length} items</span>
        </div>
        <Link href="/admin/items/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          + New Item
        </Link>
      </div>

      {typeKey === 'armor' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm">
          <span className="text-blue-400">🛡️</span>
          <span className="text-body">Configure armor preset resistances:</span>
          <Link href="/admin/presets" className="text-primary hover:underline font-medium">Edit Resistances →</Link>
        </div>
      )}

      <form method="GET" className="flex gap-2 flex-wrap items-center">
        <input type="hidden" name="type" value={typeKey} />
        <input name="q" defaultValue={q} placeholder="Search name…"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        <select name="rarity" defaultValue={rarity ?? ''}
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="">All rarities</option>
          {RARITY_ORDER.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="sort" defaultValue={sort ?? 'name'}
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="name">Sort: Name</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="tier">Sort: Tier</option>
        </select>
        <button type="submit" className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body hover:bg-accent transition-colors">Filter</button>
        <Link href={`/admin/items?type=${typeKey}`} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-body transition-colors">Clear</Link>
      </form>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Icon</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rarity</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stats</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Edit</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-accent/10'}`}>
                <td className="px-4 py-2">
                  {item.image_url
                    ? <img src={item.image_url} alt="" className="w-7 h-7 rounded object-cover" />
                    : <span className="w-7 h-7 rounded bg-accent flex items-center justify-center text-xs text-muted-foreground">?</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-heading">{item.display_name}</div>
                  <div className="text-xs text-muted-foreground">{item.name}</div>
                </td>
                <td className="px-4 py-2"><span style={{ color: RARITY_HEX[item.rarity] }}>{item.rarity}</span></td>
                <td className="px-4 py-2 text-muted-foreground">{item.equipment_tier ? `T${item.equipment_tier}` : '—'}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {item.base_damage != null && `⚔ ${item.base_damage}${item.primary_damage_type ? ` (${item.primary_damage_type})` : ''}`}
                  {item.base_defense != null && `🛡 ${item.base_defense} def`}
                  {item.primary_scaling_attr && ` · ${item.primary_scaling_attr}${item.secondary_scaling_attr ? `/${item.secondary_scaling_attr}` : ''}`}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/admin/items/${item.id}`} className="text-xs text-primary hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="py-12 text-center text-muted-foreground text-sm">No items found</div>}
      </div>
    </div>
  );
}
