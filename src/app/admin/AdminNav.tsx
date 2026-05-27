'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const NAV = [
  { href: '/admin',               label: '📊 Dashboard' },
  { label: '── Game ──',          href: null },
  { href: '/admin/items',         label: '⚔️  Items' },
  { href: '/admin/weapon-types',  label: '🗡️  Weapon Types' },
  { href: '/admin/tier-scaling',  label: '📈  Tier Scaling' },
  { href: '/admin/world',         label: '🗺️  World' },
  { href: '/admin/enemies',       label: '👹 Enemies' },
  { href: '/admin/skills',        label: '🎯 Skills' },
  { href: '/admin/progression',   label: '📈 Progression' },
  { href: '/admin/logic',         label: '🧩 Logic Overview' },
  { href: '/admin/formulas',      label: '⚙️  Formulas & Config' },
  { href: '/admin/grade-weights', label: '🎖️  Grading System' },
  { label: '── Players ──',       href: null },
  { href: '/admin/players',       label: '👥 Ledger' },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  // Optimistic active path — updates immediately on click, syncs when navigation completes.
  const [activePath, setActivePath] = useState(pathname);

  useEffect(() => {
    setActivePath(pathname);
  }, [pathname]);

  function isActive(href: string) {
    if (href === '/admin') return activePath === '/admin';
    return activePath === href || activePath.startsWith(href + '/');
  }

  return (
    <nav className="flex flex-col gap-0.5 p-2.5 flex-1">
      {NAV.map((item, i) =>
        item.href === null ? (
          <div key={i} className="px-2 pt-4 pb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            {item.label}
          </div>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setActivePath(item.href!)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm transition-colors ${
              isActive(item.href)
                ? 'bg-accent text-foreground font-medium'
                : 'text-body hover:bg-accent hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        )
      )}
    </nav>
  );
}
