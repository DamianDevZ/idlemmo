'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { getResourceIconPath } from '@/lib/item-icon';
import { startExploration, returnHome, actOnExploreEvent, useCampsiteItem } from '@/features/exploration/actions';
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

interface ConsumableItem {
  instance_id: string;
  quantity: number;
  item: { name: string; display_name: string; stats: Record<string, number>; image_url: string | null };
}

interface Props {
  character: DbCharacter & { character_attributes: DbCharacterAttributes };
  biomes: DbBiome[];
  biomeTiers: DbBiomeTier[];
  activeSession: DbExplorationSession | null;
  initialEvents: DbExplorationEvent[];
  characterSkills: Record<string, number>;
  playerToolTier: number;
  initialConsumables?: ConsumableItem[];
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
    logs: 'ðŸªµ', wood: 'ðŸªµ', planks: 'ðŸªµ',
    stone: 'ðŸª¨', cut_stone: 'ðŸª¨',
    ore: 'â›ï¸', metal: 'â›ï¸', ingots: 'ðŸ”©',
    hide: 'ðŸ¾', leather: 'ðŸ¾',
    herbs: 'ðŸŒ¿', fiber: 'ðŸŒ¿', cloth: 'ðŸ§µ',
    fish: 'ðŸŸ', berries: 'ðŸ“',
  };
  for (const [k, v] of Object.entries(map)) {
    if (item.toLowerCase().includes(k)) return v;
  }
  return 'ðŸ“¦';
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
      if ((d.quantity as number) <= 0) return { icon: 'ðŸŒ«ï¸', title: 'Nothing foundâ€¦', accent: 'muted' };
      const rawName = String(d.display_name ?? d.item ?? 'item');
      const itemKey = String(d.item ?? '');
      return {
        icon: getItemIcon(itemKey),
        iconPath: getResourceIconPath(itemKey) ?? undefined,
        title: `${d.quantity}Ã— ${capitalise(rawName)}`,
        accent: 'green',
      };
    }
    case 'enemy_encountered':
      return {
        icon: 'âš”ï¸',
        title: String(d.enemy ?? 'Enemy'),
        subtitle: undefined,
        accent: 'blue',
      };
    case 'combat_result': {
      const loot = d.lootDrops as Array<{ item: string; quantity: number }> | undefined;
      const lootStr = loot?.length
        ? loot.map(l => `${l.quantity}Ã— ${l.item.replace(/_/g, ' ')}`).join(', ')
        : null;
      return {
        icon: d.victory ? 'âš”ï¸' : 'ðŸ’€',
        title: d.victory ? `Defeated ${d.enemy}` : `Lost to ${d.enemy}`,
        subtitle: [
          d.hpLost ? `âˆ’${d.hpLost} HP` : null,
          d.xpGained ? `+${d.xpGained} XP` : null,
          lootStr,
        ].filter(Boolean).join(' Â· ') || undefined,
        accent: d.victory ? 'blue' : 'red',
      };
    }
    case 'flee_result':
      return {
        icon: d.fleeSuccess ? 'ðŸ’¨' : 'âš ï¸',
        title: d.fleeSuccess ? `Fled from ${d.enemy}` : `Flee failed!`,
        subtitle: d.hpLost ? `âˆ’${d.hpLost} HP` : undefined,
        accent: d.fleeSuccess ? 'muted' : 'red',
      };
    case 'treasure_found':
      return {
        icon: 'ðŸª™',
        iconPath: getResourceIconPath('coin') ?? undefined,
        title: `Found ${d.gold} coins`,
        accent: 'yellow',
      };
    case 'recipe_found':
      return {
        icon: 'ðŸ“œ',
        title: `Recipe: ${stripMaterialPrefix(String(d.recipe_name ?? 'Unknown'))}`,
        subtitle: String(d.category ?? ''),
        accent: 'yellow',
      };
    case 'session_ended':
      return {
        icon: 'ðŸ ',
        title: String(d.reason) === 'auto_retreat' ? 'Auto-retreated (low HP)' : 'Returned home',
        subtitle: d.hp != null ? `HP remaining: ${d.hp}` : undefined,
        accent: 'muted',
      };
    default:
      return { icon: 'âš™ï¸', title: capitalise(ev.event_type), accent: 'muted' };
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


/** Live "Xh Xm" timer showing how long the exploration session has been running. */
function DepthTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(startedAt).getTime());
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - new Date(startedAt).getTime()), 10_000);
    return () => clearInterval(id);
  }, [startedAt]);
  const totalMins = Math.floor(elapsed / 60_000);
  const hrs  = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  return <span suppressHydrationWarning>{label} in zone</span>;
}


export default function ExploreClient({ character, biomes, biomeTiers, activeSession: initialSession, initialEvents, characterSkills, playerToolTier, initialConsumables = [] }: Props) {
  const attrs = character.character_attributes;

  // â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [selectedBiome, setSelectedBiome] = useState<string>(biomes[0]?.id ?? '');
  const [selectedTier, setSelectedTier] = useState(1);

  const [retreatHp, setRetreatHp] = useState(20);
  const [activeSession, setActiveSession] = useState(initialSession);
  const [events, setEvents] = useState<DbExplorationEvent[]>(initialEvents);
  const [pendingEvent, setPendingEvent] = useState<DbExplorationEvent | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [pending, startTransition] = useTransition();

  // Track live HP and consumables in state so campsite UI reflects changes immediately
  const [currentHp, setCurrentHp] = useState(character.current_hp);
  const [consumables, setConsumables] = useState<ConsumableItem[]>(initialConsumables);

  // Persist auto-approve preference across navigation
  useEffect(() => {
    const stored = localStorage.getItem('explore:autoApprove');
    if (stored === 'true') setAutoApprove(true);
  }, []);
  useEffect(() => {
    localStorage.setItem('explore:autoApprove', String(autoApprove));
  }, [autoApprove]);
  const [error, setError] = useState('');

  // Offline catch-up: shown when returning after missing â‰¥2 ticks
  const [catchingUp, setCatchingUp] = useState(false);
  const [offlineSummary, setOfflineSummary] = useState<{
    ticksProcessed: number;
    resourcesGained: Array<{ item: string; displayName: string; quantity: number }>;
    lootGained: Array<{ item: string; quantity: number }>;
    enemiesKilled: number;
    coinsGained: number;
    xpGained: number;
    hpLost: number;
  } | null>(null);

  // Tick progress bar: track when last tick happened
  const lastTickRef = useRef<number>(Date.now());
  const [tickProgress, setTickProgress] = useState(0);

  // â”€â”€ Cycle engine refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // prefetchRef holds the tick result while the countdown runs:
  //   'in-flight' = fetch pending, null = no decision event, event = decision ready
  const cycleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchRef    = useRef<DbExplorationEvent | null | 'in-flight'>('in-flight');
  const timeElapsedRef = useRef(false);
  const sessionRef     = useRef(activeSession);
  const autoApproveRef = useRef(autoApprove);
  const startCycleRef  = useRef<() => void>(() => {});
  const revealRef      = useRef<(ev: DbExplorationEvent | null) => void>(() => {});
  // Keep mutable values in sync on every render (safe to assign in render body)
  sessionRef.current     = activeSession;
  autoApproveRef.current = autoApprove;

  // â”€â”€ Realtime subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          // Only use Realtime for session state â€” all event data comes from HTTP responses
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

  // â”€â”€ Cycle engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // revealRef and startCycleRef are re-assigned each render so async callbacks
  // always close over the freshest state/props without needing dependency arrays.

  revealRef.current = (ev: DbExplorationEvent | null) => {
    const session = sessionRef.current;
    if (!session) return;

    // Surface the event in history exactly when the progress bar completes
    if (ev) setEvents(prev => [ev, ...prev].slice(0, 50));

    const isDecision = ev && (ev.event_type === 'resource_found' || ev.event_type === 'enemy_encountered' || ev.event_type === 'campsite_reached');
    if (!isDecision) {
      startCycleRef.current(); // passive event or empty tick â€” keep going
      return;
    }

    // Campsite in auto-approve: just continue (no healing)
    if (ev.event_type === 'campsite_reached' && autoApproveRef.current) {
      actOnExploreEvent(character.id, sessionRef.current!.id, ev.id, 'campsite_continue')
        .then(() => startCycleRef.current())
        .catch(() => startCycleRef.current());
      return;
    }

    // Campsite in manual mode â€” show the campsite panel
    if (ev.event_type === 'campsite_reached') {
      setPendingEvent(ev);
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
                      hpLost: cr.hpLost, xpGained: cr.xpGained, newHp: cr.newHp, lootDrops: cr.lootDrops },
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
            return; // session over â€” don't start next cycle
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
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
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
      // else: fetch still in flight â€” bar stays at 100%, reveal fires when fetch returns
    }, intervalMs);

    // Fire the tick fetch 1.5 s before the countdown ends.
    // This ensures server-side elapsed >= tickInterval - 2 s (grace period) on every cycle
    // including the very first one after a new session starts.
    fetchTimerRef.current = setTimeout(() => {
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
    }, Math.max(0, intervalMs - 1500));
  };

  // Start cycle when session is created or changes.
  // On mount with an existing session, check for offline ticks first â€” if there are
  // â‰¥2 pending ticks (user was away), fire the catch-up endpoint before resuming.
  useEffect(() => {
    if (!activeSession) {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      return;
    }

    const intervalMs = GAME_CONFIG.exploration.tickIntervalSeconds * 1000;
    const elapsed = Date.now() - new Date(activeSession.last_tick_at).getTime();
    const pendingTicks = Math.floor(elapsed / intervalMs);

    if (pendingTicks >= 2) {
      setCatchingUp(true);
      fetch('/api/tick/catchup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character.id }),
      })
        .then(r => r.json().catch(() => ({})))
        .then((json: { processed?: number; summary?: typeof offlineSummary }) => {
          if (json.summary) {
            setOfflineSummary(json.summary);
            if ((json.summary as { sessionEnded?: boolean }).sessionEnded) {
              setActiveSession(null);
              setCatchingUp(false);
              return;
            }
          }
          setCatchingUp(false);
          startCycleRef.current();
        })
        .catch(() => {
          setCatchingUp(false);
          startCycleRef.current();
        });
    } else {
      startCycleRef.current();
    }

    return () => {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    };
  }, [activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress bar â€” fills 0â†’100% over the tick interval
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

  // â”€â”€ Derived â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const biomeTiersForSelected = biomeTiers.filter(bt => bt.biome_id === selectedBiome);

  function getTierAccess(tier: DbBiomeTier) {
    return checkBiomeTierAccess(tier, attrs, 0, 0);
  }

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        // Session may have already ended via auto-retreat â€” still clear client state
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
              : { enemy: d.enemy, level: d.level, victory: cr.victory, hpLost: cr.hpLost, xpGained: cr.xpGained, newHp: cr.newHp, lootDrops: cr.lootDrops },
            occurred_at:     new Date().toISOString(),
            acknowledged_at: null,
          };
          setEvents(prev => [synthetic, ...prev].slice(0, 50));
          // Keep HP bar in sync with actual server value
          if (cr.newHp != null) setCurrentHp(cr.newHp);
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
          return; // session over â€” don't start next cycle
        }
      } catch {
        // ignore
      }
      setPendingEvent(null);
      startCycleRef.current();
    });
  }

  function handleCampsiteUseItem(itemInstanceId: string) {
    startTransition(async () => {
      try {
        const result = await useCampsiteItem(character.id, itemInstanceId);
        if (result.ok) {
          setCurrentHp(result.newHp);
          // Decrement or remove the consumable from local state
          setConsumables(prev => prev
            .map(c => c.instance_id === itemInstanceId ? { ...c, quantity: c.quantity - 1 } : c)
            .filter(c => c.quantity > 0)
          );
        }
      } catch {
        // ignore â€” item may have been used already
      }
    });
  }

  function handleCampsiteContinue() {
    if (!pendingEvent || !activeSession) return;
    const eventId   = pendingEvent.id;
    const sessionId = activeSession.id;
    startTransition(async () => {
      try {
        await actOnExploreEvent(character.id, sessionId, eventId, 'campsite_continue');
      } catch {
        // ignore
      }
      setPendingEvent(null);
      startCycleRef.current();
    });
  }

  // â”€â”€ Active session view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Tiers for the active biome, sorted ascending â€” used for the depth bar
    const activeBiomeTiers = biomeTiers
      .filter(bt => bt.biome_id === activeTier?.biome_id)
      .sort((a, b) => a.tier - b.tier);

    return (
      <div className="p-4 md:p-6 space-y-4 max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-bold text-primary leading-tight">Exploring</h2>
            <p className="text-muted-foreground text-sm truncate">
              {activeBiome?.icon} {activeBiome?.display_name} â€” {activeTier?.display_name}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReturn} disabled={pending} className="shrink-0">
            {pending ? 'â€¦' : 'ðŸ  Return'}
          </Button>
        </div>

        {/* Depth / tier visual */}
        {activeTier && activeBiomeTiers.length > 0 && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-medium">Depth</span>
              <DepthTimer startedAt={activeSession.started_at} />
            </div>
            <div className="flex items-center gap-1.5">
              {activeBiomeTiers.map(bt => {
                const isActive  = bt.id === activeTier.id;
                const isPast    = bt.tier < activeTier.tier;
                return (
                  <div
                    key={bt.id}
                    title={bt.display_name}
                    className={`flex-1 h-2 rounded-full transition-colors ${
                      isActive ? 'bg-primary' : isPast ? 'bg-primary/35' : 'bg-muted'
                    }`}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {activeTier.display_name}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Tier {activeTier.tier}/{activeBiomeTiers.length}
              </span>
            </div>
          </div>
        )}

        {/* HP + controls row */}
        <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">HP</span>
              <span className="text-sm font-semibold tabular-nums">{character.current_hp}<span className="text-muted-foreground font-normal">/{maxHp}</span></span>
              <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">(retreat at {activeSession.retreat_hp_threshold}%)</span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={e => setAutoApprove(e.target.checked)}
                className="w-3.5 h-3.5 accent-primary"
              />
              <span className="text-xs text-muted-foreground">Auto</span>
            </label>
          </div>
          <Progress
            value={Math.min(100, (character.current_hp / maxHp) * 100)}
            className="h-1.5"
          />
        </div>

        {/* â”€â”€ Offline catch-up summary â”€â”€ */}
        {offlineSummary && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-yellow-400">â³ While you were away ({offlineSummary.ticksProcessed} ticks)</p>
              <button onClick={() => setOfflineSummary(null)} className="text-xs text-muted-foreground hover:text-foreground leading-none">âœ•</button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              {offlineSummary.resourcesGained.map(r => {
                const iconPath = getResourceIconPath(r.item);
                return (
                  <div key={r.item} className="flex items-center gap-2">
                    {iconPath
                      ? <Image src={iconPath} alt={r.displayName} width={16} height={16} className="object-contain shrink-0" />
                      : <span className="text-sm shrink-0">ðŸŒ¿</span>}
                    <span>{r.quantity}Ã— {r.displayName}</span>
                  </div>
                );
              })}
              {offlineSummary.lootGained.map(l => {
                const iconPath = getResourceIconPath(l.item);
                return (
                  <div key={l.item} className="flex items-center gap-2">
                    {iconPath
                      ? <Image src={iconPath} alt={l.item} width={16} height={16} className="object-contain shrink-0" />
                      : <span className="text-sm shrink-0">ðŸ’Ž</span>}
                    <span>{l.quantity}Ã— {l.item.replace(/_/g, ' ')}</span>
                  </div>
                );
              })}
              {offlineSummary.enemiesKilled > 0 && (
                <div className="flex items-center gap-2">
                  <Image src="/icons/equipment/weapons/sword.png" alt="enemies" width={16} height={16} className="object-contain shrink-0" />
                  <span>{offlineSummary.enemiesKilled} {offlineSummary.enemiesKilled === 1 ? 'enemy' : 'enemies'} defeated</span>
                </div>
              )}
              {offlineSummary.coinsGained > 0 && (
                <div className="flex items-center gap-2">
                  <Image src="/icons/resources/misc/coin.png" alt="coins" width={16} height={16} className="object-contain shrink-0" />
                  <span>{offlineSummary.coinsGained} coins found</span>
                </div>
              )}
              {offlineSummary.xpGained > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm shrink-0">âœ¨</span>
                  <span>+{offlineSummary.xpGained} XP</span>
                </div>
              )}
              {offlineSummary.hpLost > 0 && (
                <div className="flex items-center gap-2 text-red-400">
                  <span className="text-sm shrink-0">â¤ï¸</span>
                  <span>âˆ’{offlineSummary.hpLost} HP taken</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* â”€â”€ Catching up spinner â”€â”€ */}
        {catchingUp && (
          <div className="text-center text-sm text-muted-foreground py-3 animate-pulse">
            â³ Processing offline ticksâ€¦
          </div>
        )}

        {/* â”€â”€ Tick progress (hidden while waiting for decision) â”€â”€ */}
        {!pendingEvent && !catchingUp && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{tickProgress < 95 ? `Exploringâ€¦ next find in ${secsLeft}s` : 'Findingâ€¦'}</span>
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

        {/* â”€â”€ Decision card (replaces progress bar while awaiting choice) â”€â”€ */}
        {pendingEvent && (() => {
          const pd = (pendingEvent.data ?? {}) as Record<string, unknown>;
          const isResource = pendingEvent.event_type === 'resource_found';
          const displayName = isResource
            ? String(pd.display_name ?? capitalise(String(pd.item ?? 'item')))
            : String(pd.enemy ?? 'Enemy');
          const icon = isResource ? getItemIcon(String(pd.item ?? '')) : 'âš”ï¸';

          // â”€â”€ Gather requirement check â”€â”€
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
                    {isResource ? `Found ${pd.quantity}Ã— ${displayName}!` : `${displayName} appears!`}
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
                      onClick={() => handleEventAction('collect')}
                      disabled={pending || collectLocked}
                      className={`flex-1 h-11 text-base ${collectLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      âœ“ Collect
                    </Button>
                    <Button variant="outline" onClick={() => handleEventAction('leave')} disabled={pending} className="flex-1 h-11 text-base">
                      âœ— Leave
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={() => handleEventAction('fight')} disabled={pending} className="flex-1 h-11 text-base">
                      âš”ï¸ Fight
                    </Button>
                    <Button variant="outline" onClick={() => handleEventAction('flee')} disabled={pending} className="flex-1 h-11 text-base">
                      ðŸƒ Flee <span className="text-xs opacity-60 ml-1">(50%)</span>
                    </Button>
                  </>
                )}
              </div>
              {autoApprove && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Auto-{isResource ? 'collecting' : 'fighting'}â€¦
                </p>
              )}
            </div>
          );
        })()}

        {/* â”€â”€ Last event (shown after decision resolves) â”€â”€ */}
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
            Waiting for first tickâ€¦
          </div>
        ) : null}

        {/* â”€â”€ History â”€â”€ */}
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

  // â”€â”€ Setup view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                    className={`rounded-md border p-2.5 text-center transition-colors text-xs min-h-[64px] ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : access.canDo
                          ? 'border-border hover:border-primary/50 text-foreground'
                          : 'border-border opacity-40 cursor-not-allowed text-muted-foreground'
                    }`}
                  >
                    <div className="font-semibold">T{bt.tier}</div>
                    <div className="truncate">{bt.display_name.split(' ').slice(-1)[0]}</div>
                    {!access.canDo && <div className="text-[10px] mt-0.5">ðŸ”’</div>}
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
                    <span>Enemies lv {bt.enemy_level_min}â€“{bt.enemy_level_max}</span>
                    {bt.required_skill_level > 0 && <span>Skill â‰¥{bt.required_skill_level}</span>}
                    {bt.required_tool_tier > 0 && <span>Tool T{bt.required_tool_tier}+</span>}
                    {bt.required_attribute && (
                      <span className="capitalize">
                        {(bt.required_attribute as { stat: string; value: number }).stat} â‰¥{(bt.required_attribute as { stat: string; value: number }).value}
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
        {pending ? 'Startingâ€¦' : 'âš”ï¸ Begin Exploration'}
      </Button>
    </div>
  );
}
