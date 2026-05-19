'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { bindUltimate, unbindUltimate } from '@/features/character/bind-ultimate-action';

interface BoundUltimate {
  scrollId: string;
  name: string;
  rageCost: number;
}

interface ScrollInInventory {
  instanceId: string;
  itemId: string;
  displayName: string;
  compatibleWeaponTypeIds: string[];
}

interface EquippedWeapon {
  instanceId: string;
  displayName: string;
}

interface Props {
  characterId: string;
  boundUltimate: BoundUltimate | null;
  scrollsInInventory: ScrollInInventory[];
  equippedWeapon: EquippedWeapon | null;
}

export default function UltimatePanelClient({ characterId, boundUltimate: initial, scrollsInInventory, equippedWeapon }: Props) {
  const [bound, setBound] = useState<BoundUltimate | null>(initial);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  // Only show the panel if there is something to show
  if (!bound && scrollsInInventory.length === 0) return null;

  function handleBind(scroll: ScrollInInventory) {
    if (!equippedWeapon) { setError('Equip a weapon first to bind an ultimate.'); return; }
    setError('');
    startTransition(async () => {
      const result = await bindUltimate(characterId, scroll.itemId, equippedWeapon.instanceId);
      if (!result.ok) { setError(result.error ?? 'Failed to bind'); return; }
      setBound({ scrollId: scroll.instanceId, name: scroll.displayName, rageCost: 100 });
    });
  }

  function handleUnbind() {
    if (!bound) return;
    setError('');
    startTransition(async () => {
      const result = await unbindUltimate(characterId, bound.scrollId);
      if (!result.ok) { setError(result.error ?? 'Failed to unbind'); return; }
      setBound(null);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">⚡ Ultimate Attack</CardTitle>
        <CardDescription className="text-xs">
          Bind a special-attack scroll to your equipped weapon. At 100 rage it fires automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-xs text-destructive border border-destructive/30 rounded px-2 py-1">{error}</p>
        )}

        {bound ? (
          <div className="flex items-center justify-between rounded-lg border border-orange-500/30 bg-orange-500/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-orange-400">✨ {bound.name}</p>
              <p className="text-xs text-muted-foreground">Fires at {bound.rageCost} rage</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUnbind}
              disabled={isPending}
              className="text-xs"
            >
              Unbind
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No ultimate bound. Bind a scroll from your inventory below.</p>
        )}

        {scrollsInInventory.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scrolls in inventory</p>
            {scrollsInInventory.map(scroll => (
              <div
                key={scroll.instanceId}
                className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{scroll.displayName}</p>
                  {!equippedWeapon && (
                    <p className="text-[10px] text-muted-foreground">Equip a weapon to bind</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBind(scroll)}
                  disabled={isPending || !equippedWeapon || !!bound}
                  className="text-xs"
                >
                  {bound ? 'Unbind first' : 'Bind'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
