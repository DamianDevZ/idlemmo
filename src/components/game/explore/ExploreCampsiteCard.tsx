'use client';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ConsumableItem {
  instance_id: string;
  quantity: number;
  item_definitions: {
    name: string;
    display_name: string;
    type: string;
    consumable_effects: Array<{ trigger: string; target: string; value: number }>;
    image_url: string | null;
  } | null;
}

interface Props {
  currentHp: number;
  maxHp: number;
  consumables: ConsumableItem[];
  pending: boolean;
  onContinue: () => void;
  onUseItem: (instanceId: string) => void;
  onOpenInventory: () => void;
  onReturn: () => void;
}

export function ExploreCampsiteCard({
  currentHp, maxHp, consumables, pending,
  onContinue, onUseItem, onOpenInventory, onReturn,
}: Props) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-5 py-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-4xl">🏕️</span>
        <div>
          <p className="text-lg font-bold text-foreground">Campsite reached!</p>
          <p className="text-xs text-muted-foreground">HP {currentHp}/{maxHp} · Use items, swap gear, or return home</p>
        </div>
      </div>
      <Progress value={Math.min(100, (currentHp / maxHp) * 100)} className="h-2" />
      {consumables.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Consumables</p>
          {consumables.map(c => {
            if (!c.item_definitions) return null;
            const healAmt = (c.item_definitions.consumable_effects ?? []).find(e => e.target === 'hp')?.value ?? 0;
            return (
              <div key={c.instance_id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-xl shrink-0">🧪</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.item_definitions.display_name}</p>
                  <p className="text-xs text-muted-foreground">Heals {healAmt} HP · ×{c.quantity}</p>
                </div>
                <Button size="sm" onClick={() => onUseItem(c.instance_id)} disabled={currentHp >= maxHp}>
                  Use
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={onContinue} disabled={pending} className="flex-1 min-w-[120px]">
          Continue Exploring
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenInventory} disabled={pending}>
          🎒 Inventory
        </Button>
        <Button variant="outline" onClick={onReturn} disabled={pending} className="flex-1 min-w-[120px]">
          🏠 Return Home
        </Button>
      </div>
    </div>
  );
}
