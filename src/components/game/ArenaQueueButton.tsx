'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { joinArenaQueue, leaveArenaQueue } from '@/features/town/actions';

interface Props {
  characterId: string;
  isQueued: boolean;
}

export function ArenaQueueButton({ characterId, isQueued: initialQueued }: Props) {
  const [pending, startTransition] = useTransition();
  const [queued, setQueued] = useState(initialQueued);
  const [result, setResult] = useState<{ matched: boolean; won?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await joinArenaQueue(characterId);
        if (res.matched) {
          setResult(res);
          setQueued(false);
        } else {
          setQueued(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    });
  }

  function handleLeave() {
    setError(null);
    startTransition(async () => {
      try {
        await leaveArenaQueue(characterId);
        setQueued(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    });
  }

  if (result?.matched) {
    return (
      <div className={`rounded-lg border px-4 py-3 text-center text-sm font-semibold ${result.won ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-red-500/40 bg-red-500/10 text-red-400'}`}>
        {result.won ? '⚔ Victory! +30 rating pts' : '💀 Defeated. −10 rating pts'}
        <p className="text-xs font-normal text-muted-foreground mt-1">Refresh the page to see your updated standing.</p>
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
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={pending} onClick={handleLeave}>
            Leave
          </Button>
        </div>
      ) : (
        <Button className="w-full" disabled={pending} onClick={handleJoin}>
          {pending ? 'Joining queue…' : '⚔ Enter Arena Queue'}
        </Button>
      )}
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
