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
  const [loading, setLoading] = useState(false);
  const canSpend = pointsAvailable > 0 && currentValue < GAME_CONFIG.attributes.maxValue;

  async function handleSpend() {
    if (!canSpend) return;
    setLoading(true);
    try {
      await spendSkillPoint(characterId, attribute);
    } catch {
      // Error is non-critical — UI will revalidate anyway
    } finally {
      setLoading(false);
    }
  }

  if (!canSpend) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 w-7 p-0 shrink-0 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground"
      onClick={handleSpend}
      disabled={loading}
      title={`Raise ${attribute}`}
    >
      {loading ? '…' : '+'}
    </Button>
  );
}
