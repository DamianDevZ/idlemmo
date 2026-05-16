'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  joinArenaQueue,
  leaveArenaQueue,
  checkArenaMatch,
  type ArenaCombatResult,
  type FighterData,
  type CombatStrike,
} from '@/features/town/actions';

const POLL_INTERVAL_MS = 2_000;
const STRIKE_DELAY_MS  = 3_000;

type Phase = 'idle' | 'queued' | 'fighting' | 'result';

function cap(s: string | null | undefined) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Strike'; }

function FighterPanel({
  name, fd, isYou, currentHp, maxHp,
}: {
  name: string; fd: FighterData; isYou: boolean; currentHp: number; maxHp: number;
}) {
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  const col   = isYou ? 'text-green-400' : 'text-red-400';
  const bar   = isYou ? 'bg-green-500'   : 'bg-red-500';
  return (
    <div className={`flex-1 min-w-0 rounded border border-border bg-muted/30 p-2.5 space-y-2`}>
      <div>
        <p className={`text-xs font-bold truncate ${col}`}>{name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${hpPct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{Math.max(0,Math.round(currentHp))}/{maxHp}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
        {([['STR', fd.str], ['END', fd.end], ['DEX', fd.dex], ['VIG', fd.vig]] as const).map(([l, v]) => (
          <div key={l} className="flex gap-1">
            <span className="text-muted-foreground">{l}</span>
            <span className="text-body font-medium">{v}</span>
          </div>
        ))}
      </div>
      <div className="space-y-0.5 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground shrink-0">⚔</span>
          <span className="text-body truncate">{fd.weaponName ?? 'Unarmed'} <span className="text-muted-foreground">({cap(fd.damageType)})</span></span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground shrink-0">🛡</span>
          <span className="text-body truncate">{fd.armorName ?? 'Unarmored'}</span>
        </div>
      </div>
    </div>
  );
}

function RoundRow({
  strikes, yourName, isLatest,
}: {
  strikes: CombatStrike[]; yourName: string; isLatest: boolean;
}) {
  const yourStrike = strikes.find(s => s.attacker === yourName);
  const oppStrike  = strikes.find(s => s.attacker !== yourName);
  return (
    <div className={`grid grid-cols-2 gap-2 rounded px-2 py-2 text-xs transition-all duration-300 ${isLatest ? 'bg-primary/15 border border-primary/30' : 'opacity-55'}`}>
      <div className="border-r border-border/40 pr-2 space-y-0.5">
        {yourStrike ? (
          <>
            <p className="text-green-400 font-semibold">You hit</p>
            <p className="text-muted-foreground tabular-nums">
              <span className="text-body">{yourStrike.rawDamage}</span> raw
              {' · '}<span className="text-yellow-400">{yourStrike.deflected}</span> blk
              {' · '}<span className="font-bold text-green-400">{yourStrike.netDamage}</span> {cap(yourStrike.type)}
            </p>
          </>
        ) : <p className="text-muted-foreground">—</p>}
      </div>
      <div className="pl-2 space-y-0.5">
        {oppStrike ? (
          <>
            <p className="text-red-400 font-semibold">They hit</p>
            <p className="text-muted-foreground tabular-nums">
              <span className="text-body">{oppStrike.rawDamage}</span> raw
              {' · '}<span className="text-yellow-400">{oppStrike.deflected}</span> blk
              {' · '}<span className="font-bold text-red-400">{oppStrike.netDamage}</span> {cap(oppStrike.type)}
            </p>
          </>
        ) : <p className="text-muted-foreground">—</p>}
      </div>
    </div>
  );
}

interface Props { characterId: string; isQueued: boolean; }

export function ArenaQueueButton({ characterId, isQueued: initialQueued }: Props) {
  const [pending, startTransition] = useTransition();
  const [queued, setQueued]     = useState(initialQueued);
  const [error, setError]       = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [phase, setPhase]           = useState<Phase>('idle');
  const [combatData, setCombatData] = useState<ArenaCombatResult | null>(null);
  const [countdown, setCountdown]   = useState<number | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [barProgress, setBarProgress] = useState(0);

  useEffect(() => {
    if (!queued || !joinedAt) return;
    async function poll() {
      try {
        const res = await checkArenaMatch(characterId, joinedAt!);
        if (res.matched) {
          setQueued(false); setJoinedAt(null);
          setCombatData(res); setRevealedCount(0); setPhase('fighting');
        }
      } catch { /* ignore */ }
    }
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, joinedAt, characterId]);

  useEffect(() => {
    if (phase !== 'fighting' || !combatData) return;
    const startMs = new Date(combatData.combatStartsAt).getTime();
    const id = setInterval(() => {
      const elapsed = Date.now() - startMs;
      if (elapsed < 0) { setCountdown(Math.ceil(-elapsed / 1000)); return; }
      setCountdown(null);
      const roundCount = Math.ceil(combatData.combatLog.length / 2);
      const roundsFired = Math.floor(elapsed / STRIKE_DELAY_MS);
      const should = Math.min(roundsFired * 2, combatData.combatLog.length);
      setRevealedCount(should);
      if (roundsFired >= roundCount) {
        setBarProgress(1);
        if (elapsed > roundCount * STRIKE_DELAY_MS + 600) { setPhase('result'); clearInterval(id); }
      } else {
        setBarProgress((elapsed % STRIKE_DELAY_MS) / STRIKE_DELAY_MS);
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase, combatData]);

  function startCombat(res: ArenaCombatResult) { setCombatData(res); setRevealedCount(0); setPhase('fighting'); }

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await joinArenaQueue(characterId);
        if (res.matched) { startCombat(res); } else { setJoinedAt(new Date().toISOString()); setQueued(true); }
      } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
    });
  }

  function handleLeave() {
    setError(null); setJoinedAt(null);
    startTransition(async () => {
      try { await leaveArenaQueue(characterId); setQueued(false); }
      catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
    });
  }

  function handleReset() { setCombatData(null); setCountdown(null); setPhase('idle'); }

  if (phase === 'fighting' && combatData) {
    if (countdown !== null) {
      return (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-6 py-5 text-center space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Match Found!</p>
          <p className="text-sm">
            <span className="font-bold text-green-400">{combatData.yourName}</span>
            <span className="text-muted-foreground"> vs </span>
            <span className="font-bold text-red-400">{combatData.opponentName}</span>
          </p>
          <p className="text-5xl font-black text-primary tabular-nums leading-none">{countdown}</p>
          <p className="text-xs text-muted-foreground">Combat begins…</p>
        </div>
      );
    }

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
      <div className="rounded-lg border border-border bg-card space-y-3 p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary text-center">⚔ Combat</p>
        <div className="flex gap-2">
          <FighterPanel name={combatData.yourName} fd={combatData.yourFighterData} isYou currentHp={yourHp} maxHp={combatData.yourMaxHp} />
          <FighterPanel name={combatData.opponentName} fd={combatData.opponentFighterData} isYou={false} currentHp={oppHp} maxHp={combatData.opponentMaxHp} />
        </div>
        {(() => {
          const roundCount = Math.ceil(combatData.combatLog.length / 2);
          const roundsFired = Math.floor(revealedCount / 2);
          const allDone = roundsFired >= roundCount;
          return (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Round {Math.min(roundsFired + 1, roundCount)} / {roundCount}</span>
                {allDone
                  ? <span className="text-primary">Combat over</span>
                  : <span className="text-primary animate-pulse">Charging…</span>}
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-100 ease-linear"
                  style={{ width: `${barProgress * 100}%` }}
                />
              </div>
            </div>
          );
        })()}
        <div className="max-h-52 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
          <div className="grid grid-cols-2 gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider sticky top-0 bg-card border-b border-border/40 mb-1">
            <div className="text-green-400 border-r border-border/40 pr-2">You</div>
            <div className="text-red-400 pl-2">{combatData.opponentName}</div>
          </div>
          {(() => {
            const rounds: CombatStrike[][] = [];
            for (let i = 0; i < shownStrikes.length; i += 2) rounds.push(shownStrikes.slice(i, i + 2));
            return [...rounds].reverse().map((round, i) => (
              <RoundRow key={round[0].n} strikes={round} yourName={combatData.yourName} isLatest={i === 0} />
            ));
          })()}
        </div>
      </div>
    );
  }

  if (phase === 'result' && combatData) {
    const won = combatData.won;
    return (
      <div className={`rounded-lg border px-5 py-4 space-y-2 ${won ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
        <p className={`text-center text-xl font-black ${won ? 'text-green-400' : 'text-red-400'}`}>{won ? '⚔ VICTORY!' : '💀 DEFEATED'}</p>
        <p className="text-center text-sm text-muted-foreground">vs <span className="font-semibold text-body">{combatData.opponentName}</span></p>
        <p className={`text-center text-sm font-semibold ${won ? 'text-green-400' : 'text-red-400'}`}>{combatData.ratingDelta > 0 ? '+' : ''}{combatData.ratingDelta} rating pts</p>
        <p className="text-center text-xs text-muted-foreground">{combatData.combatLog.length} strikes exchanged</p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={handleReset}>Close</Button>
          <Button size="sm" className="flex-1 text-xs h-8" disabled={pending} onClick={handleJoin}>Fight Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {queued ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">Searching for opponent…</span>
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={pending} onClick={handleLeave}>Leave</Button>
        </div>
      ) : (
        <Button className="w-full" disabled={pending} onClick={handleJoin}>{pending ? 'Joining queue…' : '⚔ Enter Arena Queue'}</Button>
      )}
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
