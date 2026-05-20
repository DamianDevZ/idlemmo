'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { allocateCategoryXp } from '@/features/skills/actions';

interface Props {
  characterId: string;
  categoryId: string;
  skillId: string;
  /** XP cost to unlock the next tier. */
  cost: number;
  /** XP currently available in the category pool. */
  xpAvailable: number;
  canAllocate: boolean;
}

export default function AllocatePointButton({
  characterId, categoryId, skillId, cost, xpAvailable, canAllocate,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleAllocate() {
    if (!canAllocate) return;
    setLoading(true);
    try {
      await allocateCategoryXp(characterId, categoryId, skillId);
    } catch {
      // Revalidation will reflect true state
    } finally {
      setLoading(false);
    }
  }

  const pct = Math.min(100, Math.round((xpAvailable / cost) * 100));

  return (
    <div className="flex items-center gap-2 shrink-0">
      {/* Mini progress arc toward affordability */}
      <div className="w-10 h-1.5 rounded-full bg-border overflow-hidden hidden sm:block">
        <div
          className={`h-full rounded-full transition-all ${canAllocate ? 'bg-primary' : 'bg-primary/40'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
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
        title={canAllocate ? `Unlock next tier (costs ${cost} XP)` : `Need ${cost} XP (have ${xpAvailable})`}
      >
        {loading ? '…' : `+T (${cost} XP)`}
      </Button>
    </div>
  );
}
