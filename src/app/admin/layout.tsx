import { requireAdmin } from '@/lib/admin-auth';
import Link from 'next/link';
import { ReactNode } from 'react';

const NAV = [
  { href: '/admin',             label: '📊 Dashboard' },
  { label: '── Game ──',        href: null },
  { href: '/admin/items',         label: '⚔️  Items' },
  { href: '/admin/weapon-types',  label: '🗡️  Weapon Types' },
  { href: '/admin/tier-scaling',  label: '📈  Tier Scaling' },
  { href: '/admin/enemies',       label: '👹 Enemies' },
  { href: '/admin/formulas',    label: '⚙️  Formulas & Config' },
  { label: '── Players ──',     href: null },
  { href: '/admin/players',     label: '👥 Ledger' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Admin</span>
          <div className="text-heading font-bold text-sm mt-0.5">IdleMMO Control</div>
        </div>
        <nav className="flex flex-col gap-0.5 p-2 flex-1">
          {NAV.map((item, i) =>
            item.href === null ? (
              <div key={i} className="px-2 pt-3 pb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                {item.label}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-body hover:bg-accent hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
        <div className="p-3 border-t border-border">
          <Link href="/game" className="text-xs text-muted-foreground hover:text-body transition-colors">
            ← Back to game
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-6 w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
