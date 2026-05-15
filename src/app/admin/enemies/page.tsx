import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

export default async function AdminEnemiesPage() {
  await requireAdmin();
  const db = createAdminClient();

  const { data: enemies } = await db
    .from('enemy_types')
    .select('id, name, display_name, tier, level, base_hp, base_attack, base_armor, xp_reward, armor_preset_id, biomes(name)')
    .order('biomes(name)')
    .order('tier')
    .order('level');

  const { data: presets } = await db.from('armor_presets').select('id, display_name');

  const presetMap = Object.fromEntries((presets ?? []).map(p => [p.id, p.display_name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-heading">Enemies</h1>
          <p className="text-sm text-muted-foreground">{enemies?.length ?? 0} enemy types</p>
        </div>
        <Link
          href="/admin/enemies/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Enemy
        </Link>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Biome / Tier</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lvl</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">HP</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">ATK</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">DEF</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">XP</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Armor</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {enemies?.map((e, i) => {
              const biome = (Array.isArray(e.biomes) ? e.biomes[0]?.name : (e.biomes as { name: string } | null)?.name) ?? '?';
              return (
                <tr key={e.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-accent/10'}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-heading">{e.display_name}</div>
                    <div className="text-xs text-muted-foreground">{e.name}</div>
                  </td>
                  <td className="px-4 py-2 text-body capitalize">{biome} <span className="text-muted-foreground">T{e.tier}</span></td>
                  <td className="px-4 py-2 text-body">{e.level}</td>
                  <td className="px-4 py-2 text-body">{e.base_hp}</td>
                  <td className="px-4 py-2 text-body">{e.base_attack}</td>
                  <td className="px-4 py-2 text-body">{e.base_armor}</td>
                  <td className="px-4 py-2 text-body">{e.xp_reward}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{presetMap[e.armor_preset_id] ?? e.armor_preset_id}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/enemies/${e.id}`} className="text-xs text-primary hover:underline">Edit</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!enemies || enemies.length === 0) && (
          <div className="py-12 text-center text-muted-foreground text-sm">No enemies found</div>
        )}
      </div>
    </div>
  );
}
