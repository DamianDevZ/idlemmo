import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminEnemiesPage() {
  await requireAdmin();
  const db = createAdminClient();

  const { data: enemies } = await db
    .from('enemies')
    .select('id, name, display_name, icon, sort_order')
    .order('sort_order')
    .order('display_name');

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

      {(enemies?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-5xl mb-4">👹</p>
          <p className="font-semibold text-heading">No enemies yet</p>
          <p className="text-sm mt-1">Create your first enemy to get started.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/20 text-muted-foreground text-xs">
                <th className="px-4 py-2.5 text-left font-semibold">Enemy</th>
                <th className="px-4 py-2.5 text-left font-semibold">Internal name</th>
                <th className="px-4 py-2.5 text-right font-semibold">Order</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(enemies ?? []).map(e => (
                <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-accent/10 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="mr-2">{e.icon}</span>
                    <span className="font-medium text-heading">{e.display_name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{e.name}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{e.sort_order}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/admin/enemies/${e.id}`} className="text-xs text-primary hover:underline">
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

