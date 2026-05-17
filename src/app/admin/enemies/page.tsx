import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

const BIOME_EMOJI: Record<string, string> = {
  forest: '🌲', desert: '🏜️', mountain: '⛰️', dungeon: '🏰', swamp: '🌿',
  ocean: '🌊', cave: '🕳️', plains: '🌾', tundra: '❄️', volcano: '🌋',
};

export default async function AdminEnemiesPage({
  searchParams,
}: {
  searchParams: Promise<{ biome?: string; q?: string; sort?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = createAdminClient();

  // ── BIOME CARD OVERVIEW ─────────────────────────────────────────────────
  if (!params.biome) {
    const [{ data: enemies }, { data: biomes }] = await Promise.all([
      db.from('enemy_types').select('id, tier, level, base_hp, base_attack, biome_id'),
      db.from('biomes').select('id, name').order('name'),
    ]);

    const byBiome: Record<string, NonNullable<typeof enemies>> = {};
    for (const e of enemies ?? []) (byBiome[e.biome_id ?? 'unknown'] ??= []).push(e);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-heading">Enemies</h1>
            <p className="text-sm text-muted-foreground">{enemies?.length ?? 0} types across {biomes?.length ?? 0} biomes</p>
          </div>
          <Link href="/admin/enemies/new"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            + New Enemy
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(biomes ?? []).map(biome => {
            const es = byBiome[biome.id] ?? [];
            const levels = es.map(e => e.level ?? 0);
            const minLvl = levels.length ? Math.min(...levels) : 0;
            const maxLvl = levels.length ? Math.max(...levels) : 0;
            const tiers = [...new Set(es.map(e => e.tier ?? 0))].sort((a,b)=>a-b);
            const avgHp = es.length ? Math.round(es.reduce((s, e) => s + (e.base_hp ?? 0), 0) / es.length) : 0;
            const emoji = BIOME_EMOJI[biome.name.toLowerCase()] ?? '🗺️';
            const tierCounts = [1,2,3,4,5].map(t => es.filter(e => e.tier === t).length);
            const maxBar = Math.max(...tierCounts, 1);

            return (
              <Link key={biome.id} href={`/admin/enemies?biome=${biome.id}`}
                className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all cursor-pointer flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl leading-none">{emoji}</span>
                    <div>
                      <h3 className="font-bold text-heading capitalize">{biome.name}</h3>
                      <p className="text-xs text-muted-foreground">{es.length} enemy types</p>
                    </div>
                  </div>
                  <span className="text-muted-foreground group-hover:text-primary transition-colors">→</span>
                </div>

                {es.length > 0 ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-background rounded-lg p-2">
                        <div className="text-base font-bold text-heading">{minLvl}–{maxLvl}</div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Level</div>
                      </div>
                      <div className="bg-background rounded-lg p-2">
                        <div className="text-base font-bold text-heading">
                          {tiers.length === 1 ? `T${tiers[0]}` : `T${tiers[0]}–T${tiers[tiers.length-1]}`}
                        </div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Tier</div>
                      </div>
                      <div className="bg-background rounded-lg p-2">
                        <div className="text-base font-bold text-heading">{avgHp}</div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Avg HP</div>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1.5">Enemies per tier</p>
                      <div className="flex gap-1 items-end h-10">
                        {tierCounts.map((count, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                            <div className="w-full rounded-sm bg-primary/60 transition-all"
                              style={{ height: `${Math.round((count / maxBar) * 100)}%`, minHeight: count > 0 ? 4 : 0 }} />
                            <span className="text-[8px] text-muted-foreground">T{i+1}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center py-4">
                    <span className="text-xs text-muted-foreground italic">No enemies yet</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // ── ENEMY LIST (by biome) ────────────────────────────────────────────────
  const { biome: biomeId, q, sort } = params;
  const [{ data: biomeInfo }, { data: presets }] = await Promise.all([
    db.from('biomes').select('name').eq('id', biomeId!).single(),
    db.from('armor_presets').select('id, display_name'),
  ]);
  const presetMap = Object.fromEntries((presets ?? []).map(p => [p.id, p.display_name]));

  let query = db
    .from('enemy_types')
    .select('id, name, display_name, tier, level, base_hp, base_attack, base_armor, xp_reward, armor_preset_id')
    .eq('biome_id', biomeId!);
  if (q) query = query.ilike('display_name', `%${q}%`);
  const sortCol = sort === 'hp' ? 'base_hp' : sort === 'xp' ? 'xp_reward' : sort === 'level' ? 'level' : 'tier';
  query = query.order(sortCol).order('level');

  const { data: enemies } = await query;
  const biomeName = biomeInfo?.name ?? biomeId ?? 'Unknown';
  const emoji = BIOME_EMOJI[biomeName.toLowerCase()] ?? '🗺️';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/admin/enemies" className="text-sm text-muted-foreground hover:text-body transition-colors">← Biomes</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-bold text-heading capitalize">{emoji} {biomeName}</h1>
          <span className="text-sm text-muted-foreground">{enemies?.length ?? 0} enemies</span>
        </div>
        <Link href="/admin/enemies/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          + New Enemy
        </Link>
      </div>

      <form method="GET" className="flex gap-2 flex-wrap items-center">
        <input type="hidden" name="biome" value={biomeId} />
        <input name="q" defaultValue={q} placeholder="Search name…"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        <select name="sort" defaultValue={sort ?? 'tier'}
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="tier">Sort: Tier</option>
          <option value="level">Sort: Level</option>
          <option value="hp">Sort: HP</option>
          <option value="xp">Sort: XP</option>
        </select>
        <button type="submit" className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body hover:bg-accent transition-colors">Filter</button>
        <Link href={`/admin/enemies?biome=${biomeId}`} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-body">Clear</Link>
      </form>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier / Lvl</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">HP</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">ATK</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">DEF</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">XP</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Armor Preset</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Edit</th>
            </tr>
          </thead>
          <tbody>
            {enemies?.map((e, i) => (
              <tr key={e.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-accent/10'}`}>
                <td className="px-4 py-2">
                  <div className="font-medium text-heading">{e.display_name}</div>
                  <div className="text-xs text-muted-foreground">{e.name}</div>
                </td>
                <td className="px-4 py-2 text-body">T{e.tier} · Lv {e.level}</td>
                <td className="px-4 py-2 text-body">{e.base_hp}</td>
                <td className="px-4 py-2 text-body">{e.base_attack}</td>
                <td className="px-4 py-2 text-body">{e.base_armor}</td>
                <td className="px-4 py-2 text-body">{e.xp_reward}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{presetMap[e.armor_preset_id] ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/admin/enemies/${e.id}`} className="text-xs text-primary hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!enemies || enemies.length === 0) && (
          <div className="py-12 text-center text-muted-foreground text-sm">No enemies found</div>
        )}
      </div>
    </div>
  );
}
