'use client';

import Image from 'next/image';
import { getResourceIconPath } from '@/lib/item-icon';

interface Summary {
  ticksProcessed: number;
  resourcesGained: Array<{ item: string; displayName: string; quantity: number }>;
  lootGained: Array<{ item: string; quantity: number }>;
  enemiesKilled: number;
  coinsGained: number;
  xpGained: number;
  hpLost: number;
}

interface Props {
  summary: Summary;
  onDismiss: () => void;
}

export function ExploreOfflineSummary({ summary, onDismiss }: Props) {
  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-yellow-400">⏳ While you were away ({summary.ticksProcessed} ticks)</p>
        <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground leading-none">✕</button>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        {summary.resourcesGained.map(r => {
          const iconPath = getResourceIconPath(r.item);
          return (
            <div key={r.item} className="flex items-center gap-2">
              {iconPath
                ? <Image src={iconPath} alt={r.displayName} width={16} height={16} className="object-contain shrink-0" />
                : <span className="text-sm shrink-0">🌿</span>}
              <span>{r.quantity}× {r.displayName}</span>
            </div>
          );
        })}
        {summary.lootGained.map(l => {
          const iconPath = getResourceIconPath(l.item);
          return (
            <div key={l.item} className="flex items-center gap-2">
              {iconPath
                ? <Image src={iconPath} alt={l.item} width={16} height={16} className="object-contain shrink-0" />
                : <span className="text-sm shrink-0">💎</span>}
              <span>{l.quantity}× {l.item.replace(/_/g, ' ')}</span>
            </div>
          );
        })}
        {summary.enemiesKilled > 0 && (
          <div className="flex items-center gap-2">
            <Image src="/icons/equipment/weapons/sword.png" alt="enemies" width={16} height={16} className="object-contain shrink-0" />
            <span>{summary.enemiesKilled} {summary.enemiesKilled === 1 ? 'enemy' : 'enemies'} defeated</span>
          </div>
        )}
        {summary.coinsGained > 0 && (
          <div className="flex items-center gap-2">
            <Image src="/icons/resources/misc/coin.png" alt="coins" width={16} height={16} className="object-contain shrink-0" />
            <span>{summary.coinsGained} coins found</span>
          </div>
        )}
        {summary.xpGained > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm shrink-0">✨</span>
            <span>+{summary.xpGained} XP</span>
          </div>
        )}
        {summary.hpLost > 0 && (
          <div className="flex items-center gap-2 text-red-400">
            <span className="text-sm shrink-0">❤️</span>
            <span>−{summary.hpLost} HP taken</span>
          </div>
        )}
      </div>
    </div>
  );
}
