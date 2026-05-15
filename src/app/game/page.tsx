import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { calcDerivedStats, xpRequiredForLevel } from '@/lib/game/formulas';
import { Progress } from '@/components/ui/progress';
import type { DbCharacter, DbCharacterAttributes } from '@/types/game';

export const dynamic = 'force-dynamic';

export default async function HubPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: character } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', user.id)
    .single() as { data: DbCharacter | null };

  if (!character) redirect('/create-character');

  const { data: attributes } = await supabase
    .from('character_attributes')
    .select('*')
    .eq('character_id', character.id)
    .single() as { data: DbCharacterAttributes | null };

  const { count: inventoryCount } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .eq('character_id', character.id);

  const { data: activeSession } = await supabase
    .from('exploration_sessions')
    .select('id, focus_type, started_at')
    .eq('character_id', character.id)
    .eq('status', 'active')
    .maybeSingle();

  const { count: friendCount } = await supabase
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${character.id},addressee_id.eq.${character.id}`);

  const { data: arenaProfile } = await supabase
    .from('arena_profiles')
    .select('rating')
    .eq('character_id', character.id)
    .maybeSingle();

  const derived = attributes ? calcDerivedStats(attributes, 0) : null;
  const xpNeeded = xpRequiredForLevel(character.main_level);
  const xpPercent = Math.min(100, Math.round((character.main_xp / xpNeeded) * 100));
  const hasSkillPoints = character.skill_points_available > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Character banner */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{character.name}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              Level {character.main_level} &mdash;{' '}
              <span className="text-foreground/70">
                {derived?.maxHp ?? '?'} HP &middot; {derived?.carrySlots ?? '?'} carry slots
              </span>
            </p>
          </div>
          {hasSkillPoints && (
            <Link
              href="/game/character"
              className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 px-3 py-1.5 rounded-full font-semibold hover:bg-yellow-500/30 transition-colors"
            >
              {character.skill_points_available} skill {character.skill_points_available === 1 ? 'point' : 'points'} available!
            </Link>
          )}
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>XP to next level</span>
            <span className="tabular-nums">{character.main_xp.toLocaleString()} / {xpNeeded.toLocaleString()}</span>
          </div>
          <Progress value={xpPercent} className="h-1.5" />
        </div>
      </div>

      {/* Location grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LocationCard
          href="/game/home"
          emoji="🏠"
          name="Home Base"
          description="Your personal sanctuary. Manage inventory, stash, and crafting table."
          status={`${inventoryCount ?? 0} items in inventory`}
          tags={['Inventory', 'Stash', 'Crafting']}
        />
        <LocationCard
          href="/game/explore"
          emoji="🌲"
          name="The Wilds"
          description="Venture into the wilderness to gather resources and fight monsters."
          status={activeSession ? 'Currently exploring…' : 'Ready to venture out'}
          statusHighlight={!!activeSession}
          tags={['Gather', 'Combat', 'Loot']}
        />
        <LocationCard
          href="/game/town"
          emoji="🏘️"
          name="Town"
          description="Meet other adventurers, join the arena, and fight world bosses."
          status={`${friendCount ?? 0} friends · Arena ${arenaProfile?.rating ?? 1000} ELO`}
          tags={['Friends', 'Arena', 'World Boss']}
        />
        <LocationCard
          href="/game/character"
          emoji="⚔️"
          name="Character"
          description="View your attributes, derived stats, and manage your skills."
          status={hasSkillPoints ? `${character.skill_points_available} skill points waiting!` : 'Character sheet'}
          statusHighlight={hasSkillPoints}
          tags={['Attributes', 'Skills', 'Stats']}
        />
      </div>
    </div>
  );
}

function LocationCard({
  href,
  emoji,
  name,
  description,
  status,
  statusHighlight = false,
  tags,
}: {
  href: string;
  emoji: string;
  name: string;
  description: string;
  status: string;
  statusHighlight?: boolean;
  tags: string[];
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-accent/20 transition-all duration-200 overflow-hidden"
    >
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <span className="text-4xl leading-none group-hover:drop-shadow-[0_0_8px_var(--primary)] transition-all">
            {emoji}
          </span>
          <span className="text-muted-foreground/40 text-sm group-hover:text-primary/60 transition-colors">→</span>
        </div>
        <div>
          <h3 className="font-bold text-foreground text-lg leading-tight group-hover:text-primary transition-colors">
            {name}
          </h3>
          <p className="text-muted-foreground text-sm mt-1 leading-snug">{description}</p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className={`text-xs ${statusHighlight ? 'text-yellow-400/90 font-semibold' : 'text-muted-foreground'}`}>
            {status}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {tags.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}