'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { spendSkillPoint } from '@/features/character/actions';
import type { AttributeName } from '@/types/game';
import { GAME_CONFIG } from '@/config/game.config';

interface Props {
  characterId: string;
  attribute: AttributeName;
  currentValue: number;
  pointsAvailable: number;
}

export default function AttributeSpendButton({
  characterId, attribute, currentValue, pointsAvailable,
}: Props) {
  const [amount, setAmount] = useState(1);
  const [loading, setLoading] = useState(false);

  const maxAddable = Math.min(pointsAvailable, GAME_CONFIG.attributes.maxValue - currentValue);
  const canSpend = maxAddable > 0;

  if (!canSpend) return null;

  const clampedAmount = Math.max(1, Math.min(amount, maxAddable));

  async function handleSpend() {
    setLoading(true);
    try {
      await spendSkillPoint(characterId, attribute, clampedAmount);
      setAmount(1);
    } catch {
      // revalidation will sync state
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-7 p-0 border-border text-muted-foreground hover:bg-muted"
        onClick={() => setAmount(a => Math.max(1, a - 1))}
        disabled={loading || amount <= 1}
        aria-label="Decrease amount"
      >
        −
      </Button>
      <input
        type="number"
        min={1}
        max={maxAddable}
        value={amount}
        onChange={e => setAmount(Math.max(1, Math.min(maxAddable, Number(e.target.value) || 1)))}
        className="w-9 text-center text-sm tabular-nums bg-transparent border border-border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
        disabled={loading}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-7 p-0 border-border text-muted-foreground hover:bg-muted"
        onClick={() => setAmount(a => Math.min(maxAddable, a + 1))}
        disabled={loading || amount >= maxAddable}
        aria-label="Increase amount"
      >
        +
      </Button>
      <Button
        size="sm"
        className="h-7 px-2 shrink-0 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground"
        variant="outline"
        onClick={handleSpend}
        disabled={loading}
        title={`Spend ${clampedAmount} point${clampedAmount !== 1 ? 's' : ''} on ${attribute}`}
      >
        {loading ? '…' : '✓'}
      </Button>
    </div>
  );
}
