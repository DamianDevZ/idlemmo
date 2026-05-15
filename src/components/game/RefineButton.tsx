'use client';

import { useTransition, useState } from 'react';
import { refineItem } from '@/features/home/refine-action';

interface Props {
  characterId: string;
  recipeId: string;
  canRefine: boolean;
}

export function RefineButton({ characterId, recipeId, canRefine }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRefine() {
    setError(null);
    startTransition(async () => {
      try {
        await refineItem(characterId, recipeId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Refine failed');
      }
    });
  }

  return (
    <div className="space-y-1 shrink-0">
      <button
        disabled={pending || !canRefine}
        onClick={handleRefine}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
          canRefine
            ? 'bg-amber-500/10 border border-amber-500/40 text-amber-400 hover:bg-amber-500/20'
            : 'border border-border text-muted-foreground opacity-40 cursor-not-allowed'
        } disabled:opacity-40`}
      >
        {pending ? 'Refining…' : canRefine ? '⚒️ Refine' : 'Need materials'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
