import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GAME_CONFIG } from '@/config/game.config';
import GameNav from '@/components/game/GameNav';
import { AnalyticsBeacon } from '@/components/game/AnalyticsBeacon';

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Check if character exists; if not, send to creation
  const { data: character } = await supabase
    .from('characters')
    .select('id, name, main_level, current_hp')
    .eq('user_id', user.id)
    .single();

  // Allow through to create-character even without one
  if (!character) redirect('/create-character');

  // Get vigor for HP display in the nav
  const { data: attrs } = await supabase
    .from('character_attributes')
    .select('vigor')
    .eq('character_id', character!.id)
    .single();

  const maxHp = GAME_CONFIG.attributes.baseHp +
    (attrs?.vigor ?? GAME_CONFIG.character.startingAttributeValue) * GAME_CONFIG.attributes.hpPerVigor;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-44 flex-col shrink-0 border-r border-border bg-card">
        <GameNav character={{ ...character!, maxHp }} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
          <span className="text-primary font-black text-xs tracking-[0.2em] uppercase">⚔ Idle MMO</span>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">{character!.name} · Lv {character!.main_level}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] leading-none">❤️</span>
              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-500/70"
                  style={{ width: `${Math.round((character!.current_hp / maxHp) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">{character!.current_hp}/{maxHp}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0" style={{ paddingBottom: 'max(5rem, calc(4rem + env(safe-area-inset-bottom)))' }}>
          <AnalyticsBeacon />
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-card/95 backdrop-blur-sm z-40">
        <GameNav character={{ ...character!, maxHp }} mobile />
      </nav>
    </div>
  );
}
