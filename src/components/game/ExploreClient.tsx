'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { getResourceIconPath } from '@/lib/item-icon';
import { startExploration, returnHome, actOnExploreEvent } from '@/features/exploration/actions';
import type { ExploreAction } from '@/features/exploration/actions';
import { checkBiomeTierAccess } from '@/lib/game/requirements';
import { GAME_CONFIG } from '@/config/game.config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import type {
  DbBiome, DbBiomeTier, DbCharacter, DbCharacterAttributes,
  DbExplorationSession, DbExplorationEvent,
} from '@/types/game';

interface Props {
  character: DbCharacter & { character_attributes: DbCharacterAttributes };
  biomes: DbBiome[];
  biomeTiers: DbBiomeTier[];
  activeSession: DbExplorationSession | null;
  initialEvents: DbExplorationEvent[];
  characterSkills: Record<string, number>;
  playerToolTier: number;
}

function capitalise(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Strip leading material/tier adjectives so recipes show as "Axe" not "Copper Axe".
const MATERIAL_WORDS = new Set([
  'Oak','Birch','Pine','Mahogany','Ebony','Crystal','Voidwood','Crystalwood',
  'Copper','Iron','Silver','Mithril','Void','Steel','Stone',
  'Cotton','Silk','Velvet','Starweave',
  'Basic','Crude','Apprentice','Cured','Thick','Shadow','Reinforced',
]);
function stripMaterialPrefix(name: string): string {
  const words = name.split(' ');
  let i = 0;
  while (i < words.length - 1 && MATERIAL_WORDS.has(words[i])) i++;
  return words.slice(i).join(' ');
}

function getItemIcon(item: string): string {
  const map: Record<string, string> = {
    logs: '🪵', wood: '🪵', planks: '🪵',
    stone: '🪨', cut_stone: '🪨',
    ore: '⛏️', metal: '⛏️', ingots: '🔩',
    hide: '🐾', leather: '🐾',
    herbs: '🌿', fiber: '🌿', cloth: '🧵',
    fish: '🐟', berries: '🍓',
  };
  for (const [k, v] of Object.entries(map)) {
    if (item.toLowerCase().includes(k)) return v;
  }
  return '📦';
}

interface EventDisplay {
  icon: string;       // emoji fallback
  iconPath?: string;  // image path (overrides emoji when set)
  title: string;
  subtitle?: string;
  accent: 'green' | 'red' | 'yellow' | 'blue' | 'muted';
}

function formatEvent(ev: DbExplorationEvent): EventDisplay {
  const d = (ev.data ?? {}) as Record<string, unknown>;
  switch (ev.event_type) {
    case 'resource_found': {
      if ((d.quantity as number) <= 0) return { icon: '🌫️', title: 'Nothing found…', accent: 'muted' };
      const rawName = String(d.display_name ?? d.item ?? 'item');
      const itemKey = String(d.item ?? '');
      return {
        icon: getItemIcon(itemKey),
        iconPath: getResourceIconPath(itemKey) ?? undefined,
        title: `${d.quantity}× ${capitalise(rawName)}`,
        accent: 'green',
      };
    }
    case 'enemy_encountered':
      return {
        icon: '⚔️',
        title: String(d.enemy ?? 'Enemy'),
        subtitle: undefined,
        accent: 'blue',
      };
    case 'combat_result':
      return {
        icon: d.victory ? '⚔️' : '💀',
        title: d.victory ? `Defeated ${d.enemy}` : `Lost to ${d.enemy}`,
        subtitle: [
          d.hpLost ? `−${d.hpLost} HP` : null,
          d.xpGained ? `+${d.xpGained} XP` : null,
        ].filter(Boolean).join(' · ') || undefined,
        accent: d.victory ? 'blue' : 'red',
      };
    case 'flee_result':
      return {
        icon: d.fleeSuccess ? '💨' : '⚠️',
        title: d.fleeSuccess ? `Fled from ${d.enemy}` : `Flee failed!`,
        subtitle: d.hpLost ? `−${d.hpLost} HP` : undefined,
        accent: d.fleeSuccess ? 'muted' : 'red',
      };
    case 'treasure_found':
      return {
        icon: '�',
        title: `Found ${d.gold} coins`,
        accent: 'yellow',
      };
    case 'recipe_found':
      return {
        icon: '📜',
        title: `Recipe: ${stripMaterialPrefix(String(d.recipe_name ?? 'Unknown'))}`,
        subtitle: String(d.category ?? ''),
        accent: 'yellow',
      };
    case 'session_ended':
      return {
        icon: '🏠',
        title: String(d.reason) === 'auto_retreat' ? 'Auto-retreated (low HP)' : 'Returned home',
        subtitle: d.hp != null ? `HP remaining: ${d.hp}` : undefined,
        accent: 'muted',
      };
    default:
      return { icon: '⚙️', title: capitalise(ev.event_type), accent: 'muted' };
  }
}

const ACCENT_STYLES: Record<EventDisplay['accent'], { card: string; icon: string; title: string }> = {
  green:  { card: 'border-green-500/30 bg-green-500/5',   icon: 'text-4xl',           title: 'text-green-400' },
  blue:   { card: 'border-blue-500/30 bg-blue-500/5',     icon: 'text-4xl',           title: 'text-blue-400' },
  yellow: { card: 'border-yellow-500/30 bg-yellow-500/5', icon: 'text-4xl',           title: 'text-yellow-400' },
  red:    { card: 'border-red-500/30 bg-red-500/5',       icon: 'text-4xl',           title: 'text-red-400' },
  muted:  { card: 'border-border bg-card',                icon: 'text-4xl opacity-70', title: 'text-foreground' },
};

const HISTORY_ACCENT: Record<EventDisplay['accent'], string> = {
  green:  'text-green-400',
  blue:   'text-blue-400',
  yellow: 'text-yellow-400',
  red:    'text-red-400',
  muted:  'text-muted-foreground',
};


export default function ExploreClient({ character, biomes, biomeTiers, activeSession: initialSession, initialEvents, characterSkills, playerToolTier }: Props) {
  const attrs = character.character_attributes;

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedBiome, setSelectedBiome] = useState<string>(biomes[0]?.id ?? '');
  const [selectedTier, setSelectedTier] = useState(1);

  const [retreatHp, setRetreatHp] = useState(20);
  const [activeSession, setActiveSession] = useState(initialSession);
  const [events, setEvents] = useState<DbExplorationEvent[]>(initialEvents);
  const [pendingEvent, setPendingEvent] = useState<DbExplorationEvent | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  // Tick progress bar: track when last tick happened
  const lastTickRef = useRef<number>(Date.now());
  const [tickProgress, setTickProgress] = useState(0);

  // ── Cycle engine refs ───────────────────────────────────────────────────────
  // prefetchRef holds the tick result while the countdown runs:
  //   'in-flight' = fetch pending, null = no decision event, event = decision ready
  const cycleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchRef    = useRef<DbExplorationEvent | null | 'in-flight'>('in-flight');
  const timeElapsedRef = useRef(false);
  const sessionRef     = useRef(activeSession);
  const autoApproveRef = useRef(autoApprove);
  const startCycleRef  = useRef<() => void>(() => {});
  const revealRef      = useRef<(ev: DbExplorationEvent | null) => void>(() => {});
  // Keep mutable values in sync on every render (safe to assign in render body)
  sessionRef.current     = activeSession;
  autoApproveRef.current = autoApprove;

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('explore-events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'exploration_events',
          filter: `character_id=eq.${character.id}`,
        },
        (payload) => {
          const ev = payload.new as DbExplorationEvent;
          console.log('[Realtime] event received:', ev.event_type);
          // Only use Realtime for session state — all event data comes from HTTP responses
          if (ev.event_type === 'session_ended') {
            setPendingEvent(null);
            setActiveSession(null);
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] status:', status, err ?? '');
      });
    return () => { supabase.removeChannel(channel); };
  }, [character.id]);

  // ── Cycle engine ────────────────────────────────────────────────────────────
  // revealRef and startCycleRef are re-assigned each render so async callbacks
  // always close over the freshest state/props without needing dependency arrays.

  revealRef.current = (ev: DbExplorationEvent | null) => {
    const session = sessionRef.current;
    if (!session) return;

    // Surface the event in history exactly when the progress bar completes
    if (ev) setEvents(prev => [ev, ...prev].slice(0, 50));

    const isDecision = ev && (ev.event_type === 'resource_found' || ev.event_type === 'enemy_encountered');
    if (!isDecision) {
      startCycleRef.current(); // passive event or empty tick — keep going
      return;
    }

    if (autoApproveRef.current) {
      // Auto mode: resolve without ever showing a decision card
      const pd = (ev.data ?? {}) as Record<string, unknown>;
      let action: ExploreAction = 'fight';
      if (ev.event_type === 'resource_found') {
        const SKILL_LEVEL_REQ = [0, 15, 30, 50, 70];
        const itemTier    = Number(pd.item_tier   ?? 1);
        const reqToolTier = Number(pd.required_tool_tier  ?? Math.max(0, itemTier - 1));
        const reqSkillLv  = Number(pd.required_skill_level ?? (SKILL_LEVEL_REQ[itemTier - 1] ?? 0));
        const locked      = playerToolTier < reqToolTier ||
          (characterSkills[String(pd.required_skill ?? '')] ?? 0) < reqSkillLv;
        action = locked ? 'leave' : 'collect';
      }
      actOnExploreEvent(character.id, session.id, ev.id, action)
        .then(result => {
          if (ev.event_type === 'enemy_encountered' && result.combatResult) {
            const cr = result.combatResult;
            const d  = (ev.data ?? {}) as Record<string, unknown>;
            setEvents(prev => [{
              id: crypto.randomUUID(), session_id: session.id, character_id: character.id,
              event_type: 'combat_result',
              data: { enemy: d.enemy, level: d.level, victory: cr.victory,
                      hpLost: cr.hpLost, xpGained: cr.xpGained, newHp: cr.newHp },
              occurred_at: new Date().toISOString(), acknowledged_at: null,
            } as DbExplorationEvent, ...prev].slice(0, 50));
          }
          if (result.autoRetreat) {
            setEvents(prev => [{
              id: crypto.randomUUID(), session_id: session.id, character_id: character.id,
              event_type: 'session_ended', data: { reason: 'auto_retreat' },
              occurred_at: new Date().toISOString(), acknowledged_at: null,
            } as DbExplorationEvent, ...prev].slice(0, 50));
            setActiveSession(null);
            return; // session over — don't start next cycle
          }
          startCycleRef.current();
        })
        .catch(() => startCycleRef.current());
    } else {
      // Manual: show decision card; handleEventAction will call startCycleRef when done
      setPendingEvent(ev);
    }
  };

  startCycleRef.current = () => {
    const session = sessionRef.current;
    if (!session) return;

    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    prefetchRef.current    = 'in-flight';
    timeElapsedRef.current = false;
    lastTickRef.current    = Date.now();
    const intervalMs = GAME_CONFIG.exploration.tickIntervalSeconds * 1000;

    // Schedule the reveal at the end of the countdown
    cycleTimerRef.current = setTimeout(() => {
      if (!sessionRef.current) return;
      timeElapsedRef.current = true;
      if (prefetchRef.current !== 'in-flight') {
        revealRef.current(prefetchRef.current);
      }
      // else: fetch still in flight — bar stays at 100%, reveal fires when fetch returns
    }, intervalMs);

    // Fire the tick fetch immediately so it runs during the countdown
    fetch('/api/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: character.id }),
    })
      .then(r => r.json().catch(() => ({})))
      .then((json: { ok?: boolean; event?: DbExplorationEvent }) => {
        if (!sessionRef.current) return;
        const ev = (json.ok && json.event) ? json.event : null;
        prefetchRef.current = ev;
        if (timeElapsedRef.current) revealRef.current(ev);
        // else: wait for the countdown timer to call reveal
      })
      .catch(() => {
        if (!sessionRef.current) return;
        prefetchRef.current = null;
        if (timeElapsedRef.current) revealRef.current(null);
      });
  };

  // Start cycle when session is created or changes
  useEffect(() => {
    if (!activeSession) {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      return;
    }
    startCycleRef.current();
    return () => { if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current); };
  }, [activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress bar — fills 0→100% over the tick interval
  // Naturally stays at 100% when elapsed > interval (waiting for server)
  // Frozen at 100% when a manual decision is pending
  useEffect(() => {
    if (!activeSession || pendingEvent) {
      setTickProgress(pendingEvent ? 100 : 0);
      return;
    }
    const intervalMs = GAME_CONFIG.exploration.tickIntervalSeconds * 1000;
    const id = setInterval(() => {
      setTickProgress(Math.min(100, ((Date.now() - lastTickRef.current) / intervalMs) * 100));
    }, 100);
    return () => clearInterval(id);
  }, [activeSession?.id, !!pendingEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the user switches to auto while a manual decision card is showing, resolve it
  useEffect(() => {
    if (!pendingEvent || !autoApprove) return;
    const pd = (pendingEvent.data ?? {}) as Record<string, unknown>;
    let action: ExploreAction = 'fight';
    if (pendingEvent.event_type === 'resource_found') {
      const SKILL_LEVEL_REQ = [0, 15, 30, 50, 70];
      const itemTier    = Number(pd.item_tier   ?? 1);
      const reqToolTier = Number(pd.required_tool_tier  ?? Math.max(0, itemTier - 1));
      const reqSkillLv  = Number(pd.required_skill_level ?? (SKILL_LEVEL_REQ[itemTier - 1] ?? 0));
      const locked      = playerToolTier < reqToolTier ||
        (characterSkills[String(pd.required_skill ?? '')] ?? 0) < reqSkillLv;
      action = locked ? 'leave' : 'collect';
    }
    handleEventAction(action);
  }, [autoApprove]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────
  const biomeTiersForSelected = biomeTiers.filter(bt => bt.biome_id === selectedBiome);

  function getTierAccess(tier: DbBiomeTier) {
    return checkBiomeTierAccess(tier, attrs, 0, 0);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleStart() {
    setError('');
    const tier = biomeTiersForSelected.find(t => t.tier === selectedTier);
    if (!tier) return;

    startTransition(async () => {
      try {
        const sessionId = await startExploration({
          characterId: character.id,
          biomeTierId: tier.id,
          retreatHpThreshold: retreatHp,
        });
        // Clear events from previous sessions so the new session starts fresh
        setEvents([]);
        setActiveSession({ id: sessionId, character_id: character.id, biome_tier_id: tier.id, focus_type: 'balanced', status: 'active', started_at: new Date().toISOString(), last_tick_at: new Date().toISOString(), ends_at: null, retreat_hp_threshold: retreatHp, collect_preferences: {} });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to start');
      }
    });
  }

  function handleReturn() {
    if (!activeSession) return;
    startTransition(async () => {
      try {
        await returnHome(character.id, activeSession.id);
      } catch {
        // Session may have already ended via auto-retreat — still clear client state
      }
      setPendingEvent(null);
      setActiveSession(null);
    });
  }

  function handleEventAction(action: ExploreAction) {
    if (!pendingEvent || !activeSession) return;
    const eventId   = pendingEvent.id;
    const sessionId = activeSession.id;
    const captured  = pendingEvent; // snapshot before clearing
    startTransition(async () => {
      try {
        const result = await actOnExploreEvent(character.id, sessionId, eventId, action);

        // Build a synthetic result event so history updates instantly (no Realtime needed)
        if ((action === 'fight' || action === 'flee') && result.combatResult) {
          const cr = result.combatResult;
          const d  = (captured.data ?? {}) as Record<string, unknown>;
          const synthetic: DbExplorationEvent = {
            id: crypto.randomUUID(),
            session_id:   sessionId,
            character_id: character.id,
            event_type:   action === 'flee' ? 'flee_result' : 'combat_result',
            data: action === 'flee'
              ? { enemy: d.enemy, fleeSuccess: cr.fleeSuccess, hpLost: cr.hpLost, newHp: cr.newHp }
              : { enemy: d.enemy, level: d.level, victory: cr.victory, hpLost: cr.hpLost, xpGained: cr.xpGained, newHp: cr.newHp },
            occurred_at:     new Date().toISOString(),
            acknowledged_at: null,
          };
          setEvents(prev => [synthetic, ...prev].slice(0, 50));
        }

        if (result.autoRetreat) {
          const ended: DbExplorationEvent = {
            id: crypto.randomUUID(),
            session_id:   sessionId,
            character_id: character.id,
            event_type:   'session_ended',
            data:         { reason: 'auto_retreat' },
            occurred_at:  new Date().toISOString(),
            acknowledged_at: null,
          };
          setEvents(prev => [ended, ...prev].slice(0, 50));
          setActiveSession(null);
          setPendingEvent(null);
          return; // session over — don't start next cycle
        }
      } catch {
        // ignore
      }
      setPendingEvent(null);
      startCycleRef.current();
    });
  }

  // ── Active session view ────────────────────────────────────────────────────
  if (activeSession) {
    const activeTier  = biomeTiers.find(bt => bt.id === activeSession.biome_tier_id);
    const activeBiome = biomes.find(b => b.id === activeTier?.biome_id);
    const maxHp = GAME_CONFIG.attributes.baseHp + attrs.vigor * GAME_CONFIG.attributes.hpPerVigor;

    const currentEvent = events[0] ?? null;
    const historyEvents = events.slice(1);
    const current = currentEvent ? formatEvent(currentEvent) : null;
    const currentAccent = current ? ACCENT_STYLES[current.accent] : ACCENT_STYLES.muted;

    // Time until next tick
    const tickSec = GAME_CONFIG.exploration.tickIntervalSeconds;
    const secsLeft = Math.max(0, Math.ceil(tickSec - (tickProgress / 100) * tickSec));

    return (
      <div className="p-4 md:p-6 space-y-4 max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-primary">Exploring</h2>
            <p className="text-muted-foreground text-sm">
              {activeBiome?.icon} {activeBiome?.display_name} — {activeTier?.display_name}

            </p>
          </div>
          <Button variant="outline" onClick={handleReturn} disabled={pending}>
            {pending ? 'Returning…' : '🏠 Return Home'}
          </Button>
        </div>

        {/* Auto-approve toggle */}
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={e => setAutoApprove(e.target.checked)}
            className="w-3.5 h-3.5 accent-primary"
          />
          <span className="text-xs text-muted-foreground">Auto-approve (collect &amp; fight)</span>
        </label>

        {/* HP bar */}
        <Card>
          <CardContent className="pt-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">HP</span>
              <span className="font-semibold">{character.current_hp} / {maxHp}</span>
            </div>
            <Progress
              value={Math.min(100, (character.current_hp / maxHp) * 100)}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground">
              Auto-retreat at {activeSession.retreat_hp_threshold}% HP
            </p>
          </CardContent>
        </Card>

        {/* ── Tick progress (hidden while waiting for decision) ── */}
        {!pendingEvent && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{tickProgress < 95 ? `Exploring… next find in ${secsLeft}s` : 'Finding…'}</span>
              <span>{Math.round(tickProgress)}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-none"
                style={{ width: `${tickProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Decision card (replaces progress bar while awaiting choice) ── */}
        {pendingEvent && (() => {
          const pd = (pendingEvent.data ?? {}) as Record<string, unknown>;
          const isResource = pendingEvent.event_type === 'resource_found';
          const displayName = isResource
            ? String(pd.display_name ?? capitalise(String(pd.item ?? 'item')))
            : String(pd.enemy ?? 'Enemy');
          const icon = isResource ? getItemIcon(String(pd.item ?? '')) : '⚔️';

          // ── Gather requirement check ──
          const SKILL_LEVEL_REQ = [0, 15, 30, 50, 70];
          const itemTier       = Number(pd.item_tier ?? 1);
          const reqToolTier    = Number(pd.required_tool_tier ?? Math.max(0, itemTier - 1));
          const reqSkillName   = String(pd.required_skill ?? '');
          const reqSkillLevel  = Number(pd.required_skill_level ?? SKILL_LEVEL_REQ[itemTier - 1] ?? 0);
          const playerSkillLv  = characterSkills[reqSkillName] ?? 0;

          let collectLocked = false;
          let lockReason = '';
          if (isResource) {
            if (playerToolTier < reqToolTier) {
              collectLocked = true;
              lockReason = `Needs Tier ${reqToolTier} tool`;
            } else if (playerSkillLv < reqSkillLevel) {
              collectLocked = true;
              const skillLabel = reqSkillName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              lockReason = `Needs ${skillLabel} lv ${reqSkillLevel}`;
            }
          }

          return (
            <div className="rounded-xl border border-primary/40 bg-primary/5 px-5 py-5 space-y-4">
              <div className="flex items-center gap-3">
                {(() => {
                  const iconPath = isResource ? getResourceIconPath(String(pd.item ?? '')) : null;
                  return iconPath
                    ? <Image src={iconPath} alt={displayName} width={52} height={52} className="w-13 h-13 object-contain shrink-0" />
                    : <span className="text-4xl">{icon}</span>;
                })()}
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {isResource ? `Found ${pd.quantity}× ${displayName}!` : `${displayName} appears!`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isResource
                      ? (collectLocked ? lockReason : 'Pick it up or leave it behind?')
                      : 'Stand your ground or run?'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {isResource ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleEventAction('collect')}
                      disabled={pending || collectLocked}
                      className={`flex-1 ${collectLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      ✓ Collect
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEventAction('leave')} disabled={pending} className="flex-1">
                      ✗ Leave
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={() => handleEventAction('fight')} disabled={pending} className="flex-1">
                      ⚔️ Fight
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEventAction('flee')} disabled={pending} className="flex-1">
                      🏃 Flee <span className="text-xs opacity-60 ml-1">(50%)</span>
                    </Button>
                  </>
                )}
              </div>
              {autoApprove && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Auto-{isResource ? 'collecting' : 'fighting'}…
                </p>
              )}
            </div>
          );
        })()}

        {/* ── Last event (shown after decision resolves) ── */}
        {!pendingEvent && current ? (
          <div className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${currentAccent.card}`}>
            {current.iconPath
              ? <Image src={current.iconPath} alt={current.title} width={44} height={44} className="w-11 h-11 object-contain shrink-0" />
              : <span className={currentAccent.icon}>{current.icon}</span>
            }
            <div className="flex-1 min-w-0">
              <p className={`text-lg font-bold leading-tight ${currentAccent.title}`}>{current.title}</p>
              {current.subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5">{current.subtitle}</p>
              )}
              <p className="text-[10px] text-muted-foreground/60 mt-1" suppressHydrationWarning>
                {new Date(currentEvent!.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
            {currentEvent!.event_type === 'treasure_found' && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs shrink-0">
                +Coins
              </Badge>
            )}
            {currentEvent!.event_type === 'recipe_found' && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs shrink-0">
                Learned!
              </Badge>
            )}
          </div>
        ) : !pendingEvent ? (
          <div className="rounded-xl border border-border bg-card px-5 py-6 text-center text-muted-foreground text-sm">
            Waiting for first tick…
          </div>
        ) : null}

        {/* ── History ── */}
        {historyEvents.length > 0 && (
          <div className="space-y-px">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">History</p>
            {historyEvents.map(ev => {
              const fmt = formatEvent(ev);
              return (
                <div key={ev.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground/60 tabular-nums w-16 shrink-0">
                    <span suppressHydrationWarning>{new Date(ev.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                  {fmt.iconPath
                    ? <Image src={fmt.iconPath} alt="" width={20} height={20} className="w-5 h-5 object-contain shrink-0" />
                    : <span className="text-base shrink-0">{fmt.icon}</span>
                  }
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${HISTORY_ACCENT[fmt.accent]}`}>{fmt.title}</span>
                    {fmt.subtitle && (
                      <span className="text-xs text-muted-foreground ml-2">{fmt.subtitle}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Setup view ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-primary">Explore</h2>
        <p className="text-muted-foreground text-sm">Choose a location and set out. The game runs automatically.</p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Biome tabs */}
      <Tabs value={selectedBiome} onValueChange={v => { setSelectedBiome(v); setSelectedTier(1); }}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {biomes.map(b => (
            <TabsTrigger key={b.id} value={b.id} className="text-xs">
              {b.icon} {b.display_name}
            </TabsTrigger>
          ))}
        </TabsList>

        {biomes.map(b => (
          <TabsContent key={b.id} value={b.id} className="mt-3">
            <p className="text-muted-foreground text-sm mb-3">{b.description}</p>

            {/* Tier picker */}
            <div className="grid grid-cols-5 gap-2">
              {biomeTiers.filter(bt => bt.biome_id === b.id).map(bt => {
                const access = getTierAccess(bt);
                const active = selectedTier === bt.tier && selectedBiome === b.id;
                return (
                  <button
                    key={bt.id}
                    onClick={() => access.canDo && setSelectedTier(bt.tier)}
                    disabled={!access.canDo}
                    className={`rounded-md border p-2 text-center transition-colors text-xs ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : access.canDo
                          ? 'border-border hover:border-primary/50 text-foreground'
                          : 'border-border opacity-40 cursor-not-allowed text-muted-foreground'
                    }`}
                  >
                    <div className="font-semibold">T{bt.tier}</div>
                    <div className="truncate">{bt.display_name.split(' ').slice(-1)[0]}</div>
                    {!access.canDo && <div className="text-[10px] mt-0.5">🔒</div>}
                  </button>
                );
              })}
            </div>

            {/* Selected tier details */}
            {biomeTiers.filter(bt => bt.biome_id === b.id && bt.tier === selectedTier).map(bt => (
              <Card key={bt.id} className="mt-3">
                <CardContent className="pt-3 text-sm space-y-1">
                  <div className="font-medium">{bt.display_name}</div>
                  <p className="text-muted-foreground text-xs">{bt.description}</p>
                  <div className="text-xs text-muted-foreground pt-1 space-x-3">
                    <span>Enemies lv {bt.enemy_level_min}–{bt.enemy_level_max}</span>
                    {bt.required_skill_level > 0 && <span>Skill ≥{bt.required_skill_level}</span>}
                    {bt.required_tool_tier > 0 && <span>Tool T{bt.required_tool_tier}+</span>}
                    {bt.required_attribute && (
                      <span className="capitalize">
                        {(bt.required_attribute as { stat: string; value: number }).stat} ≥{(bt.required_attribute as { stat: string; value: number }).value}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Retreat HP */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <p className="text-sm font-medium">Auto-retreat at</p>
          <span className="text-sm text-primary font-bold">{retreatHp}% HP</span>
        </div>
        <input
          type="range" min={0} max={80} step={5}
          value={retreatHp}
          onChange={e => setRetreatHp(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground">
          Set to 0 to never auto-retreat. Higher values mean safer but shorter runs.
        </p>
      </div>

      {/* Start button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleStart}
        disabled={pending || !selectedBiome}
      >
        {pending ? 'Starting…' : '⚔️ Begin Exploration'}
      </Button>
    </div>
  );
}
