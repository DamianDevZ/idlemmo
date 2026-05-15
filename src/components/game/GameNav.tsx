'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/features/auth/actions';

const LOCATIONS = [
  { href: '/game',           emoji: '🏕️', label: 'Hub',        sublabel: 'Overview'   },
  { href: '/game/home',      emoji: '🏠', label: 'Home Base',  sublabel: 'Crafting & Stash' },
  { href: '/game/explore',   emoji: '🌲', label: 'The Wilds',  sublabel: 'Explore & Hunt' },
  { href: '/game/town',      emoji: '🏘️', label: 'Town',       sublabel: 'Friends & Arena' },
  { href: '/game/character', emoji: '⚔️', label: 'Character',  sublabel: 'Stats & Skills' },
];

interface Props {
  character: { name: string; main_level: number; current_hp: number; maxHp: number };
  mobile?: boolean;
}

export default function GameNav({ character, mobile }: Props) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/game') return pathname === '/game';
    return pathname.startsWith(href);
  }

  /* ── Mobile bottom bar ── */
  if (mobile) {
    return (
      <div className="flex h-16 pb-[env(safe-area-inset-bottom)]">
        {LOCATIONS.map(({ href, emoji, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {active && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-primary" />
              )}
              <span className={`text-[22px] leading-none ${active ? 'drop-shadow-[0_0_6px_var(--primary)]' : ''}`}>
                {emoji}
              </span>
              <span className={`text-[10px] leading-none font-medium ${active ? 'font-semibold' : ''}`}>
                {label.split(' ')[0]}
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  /* ── Desktop sidebar ── */
  const hpPct = Math.max(0, Math.min(100, Math.round((character.current_hp / character.maxHp) * 100)));

  return (
    <div className="flex flex-col h-full select-none">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4">
        <p className="text-primary font-black text-xs tracking-[0.25em] uppercase">⚔ Idle MMO</p>
      </div>

      {/* Location nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {LOCATIONS.map(({ href, emoji, label, sublabel }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-primary/10 text-primary border-l-2 border-primary pl-[10px]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border-l-2 border-transparent pl-[10px]'
              }`}
            >
              <span className={`text-base leading-none ${active ? 'drop-shadow-[0_0_4px_var(--primary)]' : ''}`}>
                {emoji}
              </span>
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{label}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{sublabel}</div>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Character HUD */}
      <div className="px-3 pt-3 pb-4 border-t border-border space-y-2">
        <div>
          <p className="text-xs font-bold text-foreground truncate">{character.name}</p>
          <p className="text-[10px] text-muted-foreground">Level {character.main_level}</p>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>HP</span>
            <span className="tabular-nums">{character.current_hp} / {character.maxHp}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-red-500/80 transition-all"
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full text-left mt-1"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
