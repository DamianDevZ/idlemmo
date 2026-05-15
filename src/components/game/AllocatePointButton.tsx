'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { allocateCategoryPoint } from '@/features/skills/actions';

interface Props {
  characterId: string;
  categoryId: string;
  skillId: string;
  cost: number;
  canAllocate: boolean;
}

export default function AllocatePointButton({
  characterId, categoryId, skillId, cost, canAllocate,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleAllocate() {
    if (!canAllocate) return;
    setLoading(true);
    try {
      await allocateCategoryPoint(characterId, categoryId, skillId);
    } catch {
      // Revalidation will reflect true state
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={`h-7 shrink-0 text-xs px-2 ${
        canAllocate
          ? 'border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground'
          : 'opacity-40 cursor-not-allowed'
      }`}
      onClick={handleAllocate}
      disabled={!canAllocate || loading}
      title={canAllocate ? `Level up (costs ${cost} point${cost !== 1 ? 's' : ''})` : 'Not enough points'}
    >
      {loading ? '…' : `+1 (${cost}pt)`}
    </Button>
  );
}
