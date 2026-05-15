'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EquipmentPanel } from '@/components/game/EquipmentPanel';
import type { EquippedData, EquipItemData } from '@/components/game/EquipmentPanel';

interface Props {
  characterId: string;
  equipped: EquippedData[];
  available: EquipItemData[];
}

export function EquipmentModal({ characterId, equipped, available }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm">⚔️ Equipment</Button>}
      />
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Equipment</DialogTitle>
        </DialogHeader>
        <EquipmentPanel
          characterId={characterId}
          equipped={equipped}
          available={available}
        />
      </DialogContent>
    </Dialog>
  );
}
