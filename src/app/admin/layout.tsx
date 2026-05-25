import { requireAdmin } from '@/lib/admin-auth';
import Link from 'next/link';
import { ReactNode } from 'react';
import { AdminNav } from './AdminNav';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Admin</span>
          <div className="text-heading font-bold text-base mt-0.5">IdleMMO Control</div>
        </div>
        <AdminNav />
        <div className="p-3 border-t border-border">
          <Link href="/game" className="text-xs text-muted-foreground hover:text-body transition-colors">
            ← Back to game
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
