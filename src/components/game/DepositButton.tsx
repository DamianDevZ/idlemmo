'use client';

import { useTransition } from 'react';
import { depositToStash, depositAllToStash } from '@/features/home/actions';

interface Props {
  characterId: string;
  itemId: string;
  /** Renders as a small ↓ icon button for use inside grid squares. */
  compact?: boolean;
}

export function DepositButton({ characterId, itemId, compact }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(() => depositToStash(characterId, itemId))
      }
      title="Deposit to stash"
      className={compact
        ? 'shrink-0 rounded px-1 text-[10px] font-bold text-white/50 hover:text-white transition-colors disabled:opacity-40 leading-none'
        : 'shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40'
      }
    >
      {pending ? '…' : compact ? '↓' : 'Deposit'}
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
