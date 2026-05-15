'use client';

import { useTransition } from 'react';
import { depositToStash, depositAllToStash } from '@/features/home/actions';

interface Props {
  characterId: string;
  itemId: string;
}

export function DepositButton({ characterId, itemId }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(() => depositToStash(characterId, itemId))
      }
      className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
    >
      {pending ? '…' : 'Deposit'}
    </button>
  );
}

interface DepositAllProps {
  characterId: string;
}

export function DepositAllButton({ characterId }: DepositAllProps) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(() => depositAllToStash(characterId))
      }
      className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
    >
      {pending ? 'Depositing…' : 'Deposit All'}
    </button>
  );
}
