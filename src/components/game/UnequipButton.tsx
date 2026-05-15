'use client';

import { useTransition, useState } from 'react';
import { unequipItem } from '@/features/home/equip-action';

interface Props {
  characterId: string;
  itemId: string;
}

export function UnequipButton({ characterId, itemId }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUnequip() {
    setError(null);
    startTransition(async () => {
      try {
        await unequipItem(characterId, itemId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unequip failed');
      }
    });
  }

  return (
    <div className="space-y-1">
      <button
        disabled={pending}
        onClick={handleUnequip}
        className="rounded-md px-2 py-1 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-40"
      >
        {pending ? '…' : 'Unequip'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
