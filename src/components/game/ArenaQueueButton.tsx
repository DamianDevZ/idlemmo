'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  joinArenaQueue,
  leaveArenaQueue,
  checkArenaMatch,
  type ArenaCombatResult,
  type CombatStrike,
} from '@/features/town/actions';

// Poll more frequently so the waiting player catches the match
// before combat_starts_at fires (5 s buffer in the DB).
const POLL_INTERVAL_MS = 2_000;
const STRIKE_DELAY_MS  = 1_100;

type Phase = 'idle' | 'queued' | 'fighting' | 'result';

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function HpBar({
  current,
  max,
  name,
  isYou,
}: {
  current: number;
  max: number;
  name: string;
  isYou: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={`font-semibold ${isYou ? 'text-green-400' : 'text-red-400'}`}>{name}</span>
        <span className="text-muted-foreground">
          {Math.max(0, Math.round(current))}/{max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isYou ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StrikeRow({ strike, isLatest }: { strike: CombatStrike; isLatest: boolean }) {
  return (
    <div
      className={`rounded px-3 py-2 text-xs transition-all duration-300 ${
        isLatest ? 'bg-primary/15 border border-primary/30' : 'opacity-55'
      }`}
    >
      <div>
        <span className="font-semibold text-body">{strike.attacker}</span>
        <span className="text-muted-foreground"> strikes </span>
        <span className="font-semibold text-body">{strike.defender}</span>
      </div>
      <div className="mt-0.5 text-muted-foreground">
        <span>Raw <span className="text-body">{strike.rawDamage}</span></span>
        <span className="mx-1.5">Â·</span>
        <span>Deflected <span className="text-yellow-400">{strike.deflected}</span></span>
        <span className="mx-1.5">Â·</span>
        <span className="text-red-400 font-semibold">{strike.netDamage} {strike.type}</span>
      </div>
    </div>
  );
}

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Props {
  characterId: string;
  isQueued: boolean;
}

export function ArenaQueueButton({ characterId, isQueued: initialQueued }: Props) {
  const [pending, startTransition] = useTransition();
  const [queued, setQueued]     = useState(initialQueued);
  const [error, setError]       = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);

  const [phase, setPhase]           = useState<Phase>('idle');
  const [combatData, setCombatData] = useState<ArenaCombatResult | null>(null);
  // countdown seconds remaining (wall-clock derived)
  const [countdown, setCountdown]   = useState<number | null>(null);
  // how many strikes have been revealed so far
  const [revealedCount, setRevealedCount] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  // â”€â”€ Poll for match while queued â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!queued || !joinedAt) return;
    async function poll() {
      try {
        const res = await checkArenaMatch(characterId, joinedAt!);
        if (res.matched) {
          setQueued(false);
          setJoinedAt(null);
          setCombatData(res);
          setRevealedCount(0);
          setPhase('fighting');
        }
      } catch { /* silently ignore */ }
    }
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, joinedAt, characterId]);

  // â”€â”€ Wall-clock ticker: drives countdown + strike reveals from combatStartsAt â”€
  // Both players anchor to the SAME timestamp, so their animations are in sync
  // regardless of when each player received the match result.
  useEffect(() => {
    if (phase !== 'fighting' || !combatData) return;

    const startMs = new Date(combatData.combatStartsAt).getTime();

    const id = setInterval(() => {
      const elapsed = Date.now() - startMs;

      if (elapsed < 0) {
        // Still in countdown
        setCountdown(Math.ceil(-elapsed / 1000));
        return;
      }

      // Combat started â€” clear countdown display
      setCountdown(null);

      // How many strikes should be visible by now?
      const should = Math.min(
        Math.floor(elapsed / STRIKE_DELAY_MS) + 1,
        combatData.combatLog.length,
      );
      setRevealedCount(should);

      // Transition to result after last strike + short pause
      const lastStrikeAt = (combatData.combatLog.length - 1) * STRIKE_DELAY_MS;
      if (elapsed > lastStrikeAt + 900) {
        setPhase('result');
        clearInterval(id);
      }
    }, 100);

    return () => clearInterval(id);
  }, [phase, combatData]);

  // â”€â”€ Auto-scroll log to latest strike â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [revealedCount]);

  function startCombat(res: ArenaCombatResult) {
    setCombatData(res);
    setRevealedCount(0);
    setPhase('fighting');
  }

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await joinArenaQueue(characterId);
        if (res.matched) {
          startCombat(res);
        } else {
          setJoinedAt(new Date().toISOString());
          setQueued(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    });
  }

  function handleLeave() {
    setError(null);
    setJoinedAt(null);
    startTransition(async () => {
      try {
        await leaveArenaQueue(characterId);
        setQueued(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    });
  }

  function handleReset() {
    setCombatData(null);
    setCountdown(null);
    setPhase('idle');
  }

  // â”€â”€ Fighting: countdown + live combat in one phase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (phase === 'fighting' && combatData) {
    // Countdown screen â€” combatStartsAt hasn't arrived yet
    if (countdown !== null) {
      return (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-6 py-5 text-center space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Match Found!</p>
          <p className="text-sm">
            <span className="font-bold text-green-400">{combatData.yourName}</span>
            <span className="text-muted-foreground"> vs </span>
            <span className="font-bold text-red-400">{combatData.opponentName}</span>
          </p>
          <p className="text-5xl font-black text-primary tabular-nums leading-none">
            {countdown}
          </p>
          <p className="text-xs text-muted-foreground">Combat beginsâ€¦</p>
        </div>
      );
    }

    // Live combat log
    const shownStrikes = combatData.combatLog.slice(0, revealedCount);
    let yourHp = combatData.yourMaxHp;
    let oppHp  = combatData.opponentMaxHp;
    for (const s of shownStrikes) {
      if (s.defender === combatData.yourName) yourHp -= s.netDamage;
      else oppHp -= s.netDamage;
    }
    yourHp = Math.max(0, yourHp);
    oppHp  = Math.max(0, oppHp);

    return (
      <div className="rounded-lg border border-border bg-card space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary text-center">âš” Combat</p>
        <div className="space-y-2">
          <HpBar current={yourHp} max={combatData.yourMaxHp}     name={combatData.yourName}     isYou />
          <HpBar current={oppHp}  max={combatData.opponentMaxHp} name={combatData.opponentName} isYou={false} />
        </div>
        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
          {shownStrikes.map((s, i) => (
            <StrikeRow key={s.n} strike={s} isLatest={i === shownStrikes.length - 1} />
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    );
  }

  // â”€â”€ Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (phase === 'result' && combatData) {
    const won = combatData.won;
    return (
      <div className={`rounded-lg border px-5 py-4 space-y-2 ${won ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
        <p className={`text-center text-xl font-black ${won ? 'text-green-400' : 'text-red-400'}`}>
          {won ? 'âš” VICTORY!' : 'ðŸ’€ DEFEATED'}
        </p>
        <p className="text-center text-sm text-muted-foreground">
          vs <span className="font-semibold text-body">{combatData.opponentName}</span>
        </p>
        <p className={`text-center text-sm font-semibold ${won ? 'text-green-400' : 'text-red-400'}`}>
          {combatData.ratingDelta > 0 ? '+' : ''}{combatData.ratingDelta} rating pts
        </p>
        <p className="text-center text-xs text-muted-foreground">
          {combatData.combatLog.length} strikes exchanged
        </p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={handleReset}>
            Close
          </Button>
          <Button size="sm" className="flex-1 text-xs h-8" disabled={pending} onClick={handleJoin}>
            Fight Again
          </Button>
        </div>
      </div>
    );
  }

  // â”€â”€ Idle / queued â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="space-y-2">
      {queued ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">Searching for opponentâ€¦</span>
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={pending} onClick={handleLeave}>
            Leave
          </Button>
        </div>
      ) : (
        <Button className="w-full" disabled={pending} onClick={handleJoin}>
          {pending ? 'Joining queueâ€¦' : 'âš” Enter Arena Queue'}
        </Button>
      )}
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}

