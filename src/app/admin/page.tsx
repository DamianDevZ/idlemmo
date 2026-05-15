import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

async function getStats() {
  const db = createAdminClient();
  const [
    { count: playerCount },
    { count: itemCount },
    { count: enemyCount },
    { count: activeSessions },
  ] = await Promise.all([
    db.from('characters').select('*', { count: 'exact', head: true }),
    db.from('item_definitions').select('*', { count: 'exact', head: true }),
    db.from('enemy_types').select('*', { count: 'exact', head: true }),
    db.from('exploration_sessions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ]);
  return { playerCount, itemCount, enemyCount, activeSessions };
}

function StatCard({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="text-3xl font-bold text-heading">{value ?? '—'}</div>
      <div className="text-sm font-medium text-body mt-1">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default async function AdminDashboard() {
  await requireAdmin();
  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Game overview at a glance</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Characters" value={stats.playerCount} />
        <StatCard label="Active Sessions" value={stats.activeSessions} sub="currently exploring" />
        <StatCard label="Item Definitions" value={stats.itemCount} />
        <StatCard label="Enemy Types" value={stats.enemyCount} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickLink href="/admin/items" icon="⚔️" label="Manage Items" desc="Add or edit weapons, armor, tools, consumables" />
        <QuickLink href="/admin/enemies" icon="👹" label="Manage Enemies" desc="Configure mobs, loot tables, armor presets" />
        <QuickLink href="/admin/players" icon="👥" label="Player Ledger" desc="View players, edit inventories, support tickets" />
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label, desc }: { href: string; icon: string; label: string; desc: string }) {
  return (
    <Link href={href} className="block bg-card border border-border rounded-lg p-5 hover:border-ring transition-colors group">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-heading group-hover:text-primary transition-colors">{label}</div>
      <div className="text-sm text-muted-foreground mt-1">{desc}</div>
    </Link>
  );
}
