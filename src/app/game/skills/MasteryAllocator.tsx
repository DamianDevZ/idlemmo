'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { allocateItemMastery, type ItemMasteryAllocation } from '@/features/skills/item-mastery-actions';

export type MasteryItemData = {
  masteryId: string;
  itemDefinitionId: string;
  displayName: string;
  imageUrl: string | null;
  currentTier: number;
  xpTowardNext: number;
  /** Cost (XP) to advance from currentTier to currentTier+1 */
  xpCostNext: number;
  maxTier: number;
};

export type MasteryCategoryData = {
  name: string;         // e.g. 'weapon_mastery'
  displayName: string;  // e.g. 'Weapon Mastery'
  categoryId: string;
  characterId: string;
  poolXp: number;
  items: MasteryItemData[];
};

type AllocationMap = Record<string, number>; // masteryId -> XP amount

function CategoryCard({ cat, maxTier }: { cat: MasteryCategoryData; maxTier: number }) {
  const [allocations, setAllocations] = useState<AllocationMap>({});
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);
  const [pending, startTransition]    = useTransition();

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + (v || 0), 0);
  const remaining      = cat.poolXp - totalAllocated;
  const overBudget     = totalAllocated > cat.poolXp;

  function setAllocation(masteryId: string, raw: string) {
    const val = Math.max(0, parseInt(raw, 10) || 0);
    setAllocations(prev => ({ ...prev, [masteryId]: val }));
    setSuccess(false);
    setError(null);
  }

  function handleApply() {
    setError(null);
    if (overBudget) { setError('Total exceeds available XP pool.'); return; }
    if (totalAllocated === 0) return;

    const payload: ItemMasteryAllocation[] = cat.items
      .filter(item => (allocations[item.masteryId] ?? 0) > 0)
      .map(item => ({ masteryId: item.masteryId, xp: allocations[item.masteryId] }));

    startTransition(async () => {
      const result = await allocateItemMastery(cat.characterId, cat.name, payload);
      if (result.error) {
        setError(result.error);
      } else {
        setAllocations({});
        setSuccess(true);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-3">
      {/* Category header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold">{cat.displayName}</span>
        <span className="tabular-nums text-sm font-medium text-primary">
          {cat.poolXp.toLocaleString()} XP available
        </span>
      </div>

      {cat.items.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground text-center">
          No items discovered yet. Find or craft items to unlock mastery.
        </p>
      ) : (
        <>
          <div className="divide-y divide-border">
            {cat.items.map(item => {
              const alloc    = allocations[item.masteryId] ?? 0;
              const isMaxed  = item.currentTier >= maxTier;
              const pct      = isMaxed
                ? 100
                : item.xpCostNext > 0
                  ? Math.min(100, Math.round(((item.xpTowardNext + alloc) / item.xpCostNext) * 100))
                  : 0;

              return (
                <div key={item.masteryId} className="flex items-center gap-3 px-4 py-3">
                  {/* Item icon / name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="w-6 h-6 object-contain shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{item.displayName}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${isMaxed ? 'text-yellow-400 border-yellow-400/40' : 'text-primary border-primary/40'}`}
                      >
                        {isMaxed ? 'MAX' : `T${item.currentTier}`}
                      </Badge>
                    </div>
                    {!isMaxed && (
                      <>
                        <Progress value={pct} className="h-1 mb-1" />
                        <p className="text-[11px] text-muted-foreground/70">
                          {(item.xpTowardNext + alloc).toLocaleString()} / {item.xpCostNext.toLocaleString()} XP to T{item.currentTier + 1}
                        </p>
                      </>
                    )}
                  </div>

                  {/* XP input */}
                  {!isMaxed && (
                    <input
                      type="number"
                      min={0}
                      max={cat.poolXp}
                      value={alloc || ''}
                      placeholder="0"
                      onChange={e => setAllocation(item.masteryId, e.target.value)}
                      className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer: summary + apply */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-card/50">
            <div className="text-xs text-muted-foreground">
              Allocating{' '}
              <span className={`font-semibold ${overBudget ? 'text-red-400' : 'text-foreground'}`}>
                {totalAllocated.toLocaleString()}
              </span>{' '}
              /{' '}
              <span className="text-foreground font-semibold">{cat.poolXp.toLocaleString()}</span> XP
              {!overBudget && remaining > 0 && (
                <span className="text-muted-foreground/60"> ({remaining.toLocaleString()} remaining)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-red-400">{error}</span>}
              {success && <span className="text-xs text-green-400">Applied!</span>}
              <Button
                size="sm"
                disabled={pending || totalAllocated === 0 || overBudget}
                onClick={handleApply}
                className="text-xs px-3 py-1.5 h-auto"
              >
                {pending ? 'Applying...' : 'Apply XP'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface MasteryAllocatorProps {
  categories: MasteryCategoryData[];
  maxTier: number;
}

/**
 * Client component rendered inside the Mastery, Crafting, and Refining tabs.
 * Shows discovered items per category with XP allocation inputs.
 */
export function MasteryAllocator({ categories, maxTier }: MasteryAllocatorProps) {
  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nothing discovered yet. Go explore!
      </p>
    );
  }

  return (
    <div>
      {categories.map(cat => (
        <CategoryCard key={cat.name} cat={cat} maxTier={maxTier} />
      ))}
    </div>
  );
}
