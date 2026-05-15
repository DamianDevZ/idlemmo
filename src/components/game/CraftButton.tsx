'use client';

import { useTransition, useState } from 'react';
import { craftItem } from '@/features/home/craft-action';

interface Props {
  characterId: string;
  recipeId: string;
  canCraft: boolean; // false when any ingredient is missing
}

export function CraftButton({ characterId, recipeId, canCraft }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCraft() {
    setError(null);
    startTransition(async () => {
      try {
        await craftItem(characterId, recipeId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Craft failed');
      }
    });
  }

  return (
    <div className="space-y-1">
      <button
        disabled={pending || !canCraft}
        onClick={handleCraft}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          canCraft
            ? 'bg-primary/10 border border-primary/40 text-primary hover:bg-primary/20'
            : 'border border-border text-muted-foreground opacity-40 cursor-not-allowed'
        } disabled:opacity-40`}
      >
        {pending ? 'Crafting…' : canCraft ? '🔨 Craft' : 'Missing items'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
