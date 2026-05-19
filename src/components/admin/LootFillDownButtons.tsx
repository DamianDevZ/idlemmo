'use client';

import { useTransition } from 'react';

type TierRow = { tier: number; item_tier: number | null };

interface LootFillDownButtonsProps {
  sourceTier: number;
  sourceItemTier: number | null;
  maxTier: number;
  /** Whether the item itself is tiered (controls showing Match / +1 buttons) */
  isItemTiered: boolean;
  /** Called with the computed rows for every tier above sourceTier */
  onFillDown: (rows: TierRow[]) => Promise<void>;
}

export function LootFillDownButtons({
  sourceTier,
  sourceItemTier,
  maxTier,
  isItemTiered,
  onFillDown,
}: LootFillDownButtonsProps) {
  const [isPending, startTransition] = useTransition();

  if (sourceTier >= maxTier) return null;

  function buildRows(strategy: 'duplicate' | 'match' | 'increase'): TierRow[] {
    const rows: TierRow[] = [];
    for (let t = sourceTier + 1; t <= maxTier; t++) {
      let itemTier: number | null = sourceItemTier;
      if (strategy === 'match' && sourceItemTier != null) {
        itemTier = t;
      } else if (strategy === 'increase' && sourceItemTier != null) {
        itemTier = Math.min(sourceItemTier + (t - sourceTier), maxTier);
      }
      rows.push({ tier: t, item_tier: itemTier });
    }
    return rows;
  }

  function handle(strategy: 'duplicate' | 'match' | 'increase') {
    startTransition(() => onFillDown(buildRows(strategy)));
  }

  const btn =
    'px-1.5 py-0.5 text-[10px] rounded border border-dashed border-border text-muted-foreground ' +
    'hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-40';

  return (
    <div className="flex gap-1 flex-wrap justify-end mt-0.5">
      <button
        type="button"
        disabled={isPending}
        onClick={() => handle('duplicate')}
        className={btn}
        title={`Copy exact row to T${sourceTier + 1}–T${maxTier}`}
      >
        📋 Dup
      </button>
      {isItemTiered && (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handle('match')}
            className={btn}
            title="Set item tier = area tier for each following tier"
          >
            🎯 Match
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handle('increase')}
            className={btn}
            title="Increase item tier by +1 per tier step"
          >
            📈 +1/tier
          </button>
        </>
      )}
    </div>
  );
}
