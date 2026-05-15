'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { joinWorldBoss, attackWorldBoss } from '@/features/world-boss/actions';

interface Boss {
  id: string;
  name: string;
  current_hp: number;
  max_hp: number;
  status: string;
  queue_closes_at: string | null;
}

interface Props {
  boss: Boss;
  characterId: string;
  isParticipant: boolean;
  lastAttackAt: string | null;
  participantCount: number;
}

const ATTACK_COOLDOWN_SECS = 30;

export function WorldBossPanel({
  boss: initialBoss,
  characterId,
  isParticipant: initialIsParticipant,
  lastAttackAt: initialLastAttack,
  participantCount,
}: Props) {
  const [boss, setBoss] = useState(initialBoss);
  const [isParticipant, setIsParticipant] = useState(initialIsParticipant);
  const [lastAttackAt, setLastAttackAt] = useState(initialLastAttack);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<{ damage: number; isKill: boolean } | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);

  // Countdown timer for attack cooldown
  useEffect(() => {
    if (!lastAttackAt) {
      setCooldownSecs(0);
      return;
    }
    const update = () => {
      const elapsed = (Date.now() - new Date(lastAttackAt).getTime()) / 1000;
      setCooldownSecs(Math.max(0, Math.ceil(ATTACK_COOLDOWN_SECS - elapsed)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastAttackAt]);

  async function handleJoin() {
    setPending(true);
    setError('');
    try {
      await joinWorldBoss(boss.id, characterId);
      setIsParticipant(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join');
    } finally {
      setPending(false);
    }
  }

  async function handleAttack() {
    setPending(true);
    setError('');
    setLastResult(null);
    try {
      const result = await attackWorldBoss(boss.id, characterId);
      setLastAttackAt(new Date().toISOString());
      setBoss(prev => ({ ...prev, current_hp: result.new_hp }));
      setLastResult({ damage: result.damage, isKill: result.is_kill });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to attack');
    } finally {
      setPending(false);
    }
  }

  const hpPct = Math.max(0, Math.round((boss.current_hp / boss.max_hp) * 100));
  const canAttack = isParticipant && boss.status === 'in_progress' && cooldownSecs === 0 && !pending;

  return (
    <Card className="border-red-500/20">
      <CardContent className="pt-4 space-y-3">
        {/* Boss name + status */}
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-red-400 text-base">{boss.name}</p>
          <Badge variant="destructive" className="text-xs capitalize shrink-0">
            {boss.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* HP bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>HP</span>
            <span className="tabular-nums">
              {boss.current_hp.toLocaleString()} / {boss.max_hp.toLocaleString()}
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-red-500/70 transition-all duration-500"
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>

        {/* Participants */}
        <p className="text-xs text-muted-foreground">
          {participantCount} {participantCount === 1 ? 'adventurer' : 'adventurers'} participating
          {boss.status === 'queuing' && boss.queue_closes_at && (
            <span> · Battle starts soon</span>
          )}
        </p>

        {/* Attack result flash */}
        {lastResult && (
          <p className={`text-sm text-center font-semibold ${lastResult.isKill ? 'text-green-400' : 'text-yellow-400'}`}>
            {lastResult.isKill
              ? '🎉 Boss defeated! Rewards distributed!'
              : `⚔️ Hit for ${lastResult.damage} damage!`}
          </p>
        )}

        {/* Error */}
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}

        {/* Actions */}
        {boss.status === 'completed' && (
          <p className="text-center text-sm text-green-400">🏆 Boss defeated — rewards have been distributed.</p>
        )}

        {boss.status !== 'completed' && !isParticipant && (
          <Button className="w-full" onClick={handleJoin} disabled={pending}>
            {pending ? '…' : '⚔️ Join Fight'}
          </Button>
        )}

        {isParticipant && boss.status === 'queuing' && (
          <p className="text-center text-sm text-muted-foreground py-1">
            ✅ You have joined — waiting for the battle to start…
          </p>
        )}

        {isParticipant && boss.status === 'in_progress' && (
          <Button
            className="w-full"
            onClick={handleAttack}
            disabled={!canAttack}
          >
            {pending
              ? '⚔️ Attacking…'
              : cooldownSecs > 0
              ? `⏱ Next attack in ${cooldownSecs}s`
              : '⚔️ Attack Boss'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
