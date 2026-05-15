'use client';

import { useTransition, useState } from 'react';
import { equipItem } from '@/features/home/equip-action';

interface Props {
  characterId: string;
  itemId: string;
}

export function EquipButton({ characterId, itemId }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEquip() {
    setError(null);
    startTransition(async () => {
      try {
        await equipItem(characterId, itemId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Equip failed');
      }
    });
  }

  return (
    <div className="space-y-1">
      <button
        disabled={pending}
        onClick={handleEquip}
        className="rounded-md px-3 py-1.5 text-xs font-medium border border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-40"
      >
        {pending ? 'Equipping…' : 'Equip'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
