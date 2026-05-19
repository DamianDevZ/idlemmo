'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { getResourceIconPath } from '@/lib/item-icon';
import { startExploration, returnHome, actOnExploreEvent, useCampsiteItem, getExploreInventory } from '@/features/exploration/actions';
import type { ExploreAction } from '@/features/exploration/actions';
import { GAME_CONFIG } from '@/config/game.config';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type {
  DbCharacter, DbCharacterAttributes,
  DbExplorationSession, DbExplorationEvent,
} from '@/types/game';
import { ExploreSetupView } from './explore/ExploreSetupView';
import { ExploreOfflineSummary } from './explore/ExploreOfflineSummary';
import { ExploreCampsiteCard } from './explore/ExploreCampsiteCard';
import { ExploreDecisionCard } from './explore/ExploreDecisionCard';

interface ConsumableItem {
  instance_id: string;
  quantity: number;
  item_definitions: { name: string; display_name: string; type: string; consumable_effects: Array<{ trigger: string; target: string; value: number }>; image_url: string | null } | null;
}

interface Area {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  sort_order: number;
  image_url: string | null;
}

interface Props {
  character: DbCharacter & { character_attributes: DbCharacterAttributes };
  areas: Area[];
  areaTiers: Record<string, number[]>;
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
    case 'combat_result': {
      const loot = d.lootDrops as Array<{ item: string; quantity: number }> | undefined;
      const lootStr = loot?.length
        ? loot.map(l => `${l.quantity}× ${l.item.replace(/_/g, ' ')}`).join(', ')
        : null;
      const ult = d.ultimateFired as { name: string; bonusDamage: number } | undefined;
      return {
        icon: d.victory ? '⚔️' : '💀',
        title: d.victory ? `Defeated ${d.enemy}` : `Lost to ${d.enemy}`,
        subtitle: [
          d.hpLost ? `−${d.hpLost} HP` : null,
          d.xpGained ? `+${d.xpGained} XP` : null,
          lootStr,
          ult ? `✨ ${ult.name} +${ult.bonusDamage} dmg` : null,
        ].filter(Boolean).join(' · ') || undefined,
        accent: d.victory ? 'blue' : 'red',
      };
    }
    case 'character_died': {
      const dropped = d.dropped as Array<{ name: string; quantity: number }> | undefined;
      return {
        icon: '💀',
        title: `Killed by ${d.enemy} — you died`,
        subtitle: dropped?.length
          ? `Lost: ${dropped.map(i => `${i.quantity}× ${i.name}`).join(', ')}`
          : 'Lost all carried items',
        accent: 'red',
      };
    }
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
    case 'campsite_reached':
      return { icon: '🏕️', title: 'Campsite', subtitle: 'Rested and continued exploring', accent: 'muted' };
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

function DepthTimer({ startedAt }: { startedAt: string }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    function update() {
      const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
      setLabel(mins < 1 ? 'Just arrived' : `${mins}m in zone`);
    }
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="text-xs text-muted-foreground" suppressHydrationWarning>{label}</span>;
}


export default function ExploreClient({ character, areas, areaTiers, activeSession: initialSession, initialEvents, characterSkills, playerToolTier, initialConsumables = [] }: Props) {
  const attrs = character.character_attributes;

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedArea, setSelectedArea] = useState<string>(areas[0]?.id ?? '');
  const [selectedTier, setSelectedTier] = useState(1);

  const [retreatHp, setRetreatHp] = useState(20);
  const [activeSession, setActiveSession] = useState(initialSession);
  const [events, setEvents] = useState<DbExplorationEvent[]>(initialEvents);
  const [pendingEvent, setPendingEvent] = useState<DbExplorationEvent | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const [currentHp, setCurrentHp] = useState(character.current_hp);
  const [currentRage, setCurrentRage] = useState(initialSession?.current_rage ?? 0);
  const [deathInfo, setDeathInfo] = useState<{ droppedItems: Array<{ name: string; quantity: number }> } | null>(null);
  const [consumables, setConsumables] = useState<ConsumableItem[]>(initialConsumables);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<Awaited<ReturnType<typeof getExploreInventory>>>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // Offline catch-up: shown when returning after missing ≥2 ticks
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

  // ── Cycle engine refs ───────────────────────────────────────────────────────
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

    const isDecision = ev && (
      ev.event_type === 'resource_found' ||
      ev.event_type === 'enemy_encountered' ||
      ev.event_type === 'campsite_reached'
    );
    if (!isDecision) {
      startCycleRef.current(); // passive event or empty tick — keep going
      return;
    }

    if (ev.event_type === 'campsite_reached') {
      // Always pause at campsite — player must decide to continue, heal, or leave.
      // Auto mode does not skip campsites.
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
            if (cr.newHp != null) setCurrentHp(cr.newHp);
            if (cr.newRage != null) setCurrentRage(cr.newRage as number);
            if (result.died) { setDeathInfo({ droppedItems: result.droppedItems ?? [] }); setActiveSession(null); return; }
            setEvents(prev => [{
              id: crypto.randomUUID(), session_id: session.id, character_id: character.id,
              event_type: 'combat_result',
              data: { enemy: d.enemy, level: d.level, victory: cr.victory,
                      hpLost: cr.hpLost, xpGained: cr.xpGained, newHp: cr.newHp, lootDrops: cr.lootDrops, ultimateFired: cr.ultimateFired },
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
      // else: fetch still in flight — bar stays at 100%, reveal fires when fetch returns
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
  // On mount with an existing session, check for offline ticks first — if there are
  // ≥2 pending ticks (user was away), fire the catch-up endpoint before resuming.
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
  // (but never auto-resolve campsites — they always require a player decision)
  useEffect(() => {
    if (!pendingEvent || !autoApprove) return;
    if (pendingEvent.event_type === 'campsite_reached') return;
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
  const tiersForSelected = areaTiers[selectedArea] ?? [];

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleStart() {
    setError('');
    if (!selectedArea || !tiersForSelected.includes(selectedTier)) return;

    startTransition(async () => {
      try {
        const sessionId = await startExploration({
          characterId: character.id,
          areaId: selectedArea,
          areaTier: selectedTier,
          retreatHpThreshold: retreatHp,
        });
        // Clear events from previous sessions so the new session starts fresh
        setEvents([]);
        setActiveSession({ id: sessionId, character_id: character.id, area_id: selectedArea, area_tier: selectedTier, biome_tier_id: null, focus_type: 'balanced', status: 'active', started_at: new Date().toISOString(), last_tick_at: new Date().toISOString(), ends_at: null, retreat_hp_threshold: retreatHp, collect_preferences: {}, current_rage: 0 });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to start');
      }
    });
  }

  async function handleCampsiteUseItem(itemInstanceId: string) {
    const result = await useCampsiteItem(character.id, itemInstanceId);
    if (result.ok && result.newHp != null) {
      setCurrentHp(result.newHp);
      setConsumables(prev =>
        prev
          .map(c => c.instance_id === itemInstanceId ? { ...c, quantity: c.quantity - 1 } : c)
          .filter(c => c.quantity > 0)
      );
    }
  }

  function handleCampsiteContinue() {
    if (!pendingEvent || !activeSession) return;
    const eventId   = pendingEvent.id;
    const sessionId = activeSession.id;
    setPendingEvent(null);
    startTransition(async () => {
      await actOnExploreEvent(character.id, sessionId, eventId, 'campsite_continue').catch(() => {});
      startCycleRef.current();
    });
  }

  async function handleOpenInventory() {
    setInventoryOpen(true);
    if (inventoryItems.length === 0) {
      setInventoryLoading(true);
      const items = await getExploreInventory(character.id).catch(() => []);
      setInventoryItems(items);
      setInventoryLoading(false);
    }
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
          if (cr.newHp != null) setCurrentHp(cr.newHp);
          if (cr.newRage != null) setCurrentRage(cr.newRage);
          if (result.died) {
            setDeathInfo({ droppedItems: result.droppedItems ?? [] });
            setActiveSession(null);
            setPendingEvent(null);
            return;
          }
          const synthetic: DbExplorationEvent = {
            id: crypto.randomUUID(),
            session_id:   sessionId,
            character_id: character.id,
            event_type:   action === 'flee' ? 'flee_result' : 'combat_result',
            data: action === 'flee'
              ? { enemy: d.enemy, fleeSuccess: cr.fleeSuccess, hpLost: cr.hpLost, newHp: cr.newHp }
              : { enemy: d.enemy, level: d.level, victory: cr.victory, hpLost: cr.hpLost, xpGained: cr.xpGained, newHp: cr.newHp, lootDrops: cr.lootDrops, ultimateFired: (cr as Record<string, unknown>).ultimateFired },
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
    const activeArea = activeSession.area_id
      ? areas.find(a => a.id === activeSession.area_id)
      : null;
    const activeAreaTier = activeSession.area_tier ?? 1;
    const allAreaTiers = activeSession.area_id ? (areaTiers[activeSession.area_id] ?? []) : [];
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-bold text-primary leading-tight">Exploring</h2>
            <p className="text-muted-foreground text-sm truncate">
              {activeArea?.icon} {activeArea?.display_name ?? 'Unknown Area'}{activeSession.area_tier ? ` — Tier ${activeSession.area_tier}` : ''}
            </p>
          </div>
          <div className="text-xs text-muted-foreground shrink-0">
            {activeSession && <span>🟢 Active</span>}
          </div>
        </div>

        {/* Depth tier bar */}
        {allAreaTiers.length > 0 && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Depth</p>
              <DepthTimer startedAt={activeSession.started_at} />
            </div>
            <div className="flex gap-1">
              {allAreaTiers.map((t) => (
                <div
                  key={t}
                  title={`Tier ${t}`}
                  className={`flex-1 h-2 rounded-full transition-colors border ${
                    t < activeAreaTier ? 'bg-primary/35 border-primary/30' :
                    t === activeAreaTier ? 'bg-primary border-primary' :
                    'bg-muted/30 border-border'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Tier {activeAreaTier}/{allAreaTiers.length}
            </p>
          </div>
        )}

        {/* HP + controls row */}
        <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">HP</span>
              <span className="text-sm font-semibold tabular-nums">{currentHp}<span className="text-muted-foreground font-normal">/{maxHp}</span></span>
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
            value={Math.min(100, (currentHp / maxHp) * 100)}
            className="h-1.5"
          />
          {/* Rage meter — only show if player has dealt or received combat hits */}
          {currentRage > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-orange-400 font-semibold uppercase tracking-widest">⚡ Rage</span>
                <span className="text-[10px] text-orange-400 tabular-nums">{currentRage}/100</span>
              </div>
              <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${currentRage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Offline catch-up summary ── */}
        {offlineSummary && (
          <ExploreOfflineSummary
            summary={offlineSummary}
            onDismiss={() => setOfflineSummary(null)}
          />
        )}

        {/* ── Catching up spinner ── */}
        {catchingUp && (
          <div className="text-center text-sm text-muted-foreground py-3 animate-pulse">
            ⏳ Processing offline ticks…
          </div>
        )}

        {/* ── Tick progress (hidden while waiting for decision) ── */}
        {!pendingEvent && !catchingUp && (
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

        {/* ── Campsite card ── */}
        {pendingEvent?.event_type === 'campsite_reached' && (
          <ExploreCampsiteCard
            currentHp={currentHp}
            maxHp={maxHp}
            consumables={consumables}
            pending={pending}
            onContinue={handleCampsiteContinue}
            onUseItem={handleCampsiteUseItem}
            onOpenInventory={handleOpenInventory}
            onReturn={handleReturn}
          />
        )}

        {/* ── Decision card (replaces progress bar while awaiting choice) ── */}
        {pendingEvent && pendingEvent.event_type !== 'campsite_reached' && (
          <ExploreDecisionCard
            event={pendingEvent}
            characterSkills={characterSkills}
            playerToolTier={playerToolTier}
            pending={pending}
            autoApprove={autoApprove}
            onAction={handleEventAction}
          />
        )}

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

        {/* ── Inventory sheet ── */}
        <Sheet open={inventoryOpen} onOpenChange={setInventoryOpen}>
          <SheetContent side="bottom" className="h-[70vh] rounded-t-xl flex flex-col">
            <SheetHeader>
              <SheetTitle>Inventory</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-2 mt-2">
              {inventoryLoading && (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              )}
              {!inventoryLoading && inventoryItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nothing in inventory.</p>
              )}
              {inventoryItems.map(row => {
                if (!row.item_definitions) return null;
                const def = row.item_definitions;
                return (
                  <div key={row.instance_id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <span className="text-xl shrink-0">📦</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{def.display_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{def.type}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-primary shrink-0">×{row.quantity}</span>
                  </div>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // ── Setup view ─────────────────────────────────────────────────────────────
  return (
    <ExploreSetupView
      areas={areas}
      areaTiers={areaTiers}
      selectedArea={selectedArea}
      onSelectArea={(id, firstTier) => { setSelectedArea(id); setSelectedTier(firstTier); }}
      selectedTier={selectedTier}
      onSelectTier={setSelectedTier}
      retreatHp={retreatHp}
      onRetreatHpChange={setRetreatHp}
      pending={pending}
      tiersForSelected={tiersForSelected}
      onStart={handleStart}
      error={error}
      deathInfo={deathInfo}
      onDismissDeath={() => setDeathInfo(null)}
    />
  );
}
