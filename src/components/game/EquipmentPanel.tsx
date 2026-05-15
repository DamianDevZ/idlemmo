'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { equipItem, unequipItem } from '@/features/home/equip-action';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EquipItemData {
  item_id: string;
  display_name: string;
  name: string;
  type: string;
  rarity: string;
  stats: Record<string, number>;
  tool_tier: number | null;
  source: 'inventory' | 'stash';
}

export interface EquippedData {
  slot: string;
  item_id: string;
  display_name: string;
  name: string;
  type: string;
  rarity: string;
  stats: Record<string, number>;
  tool_tier: number | null;
}

interface Props {
  characterId: string;
  equipped: EquippedData[];          // currently equipped items
  available: EquipItemData[];        // unequipped items from both inventory + stash
}

// ─── Slot metadata ────────────────────────────────────────────────────────────

const SLOT_META = [
  { slot: 'weapon',       label: 'Weapon',   icon: '⚔️',  hint: 'Swords, daggers, bows, staves' },
  { slot: 'chest',        label: 'Armor',    icon: '🛡️',  hint: 'Chest armour' },
  { slot: 'tool_axe',     label: 'Axe',      icon: '🪓',  hint: 'Woodcutting' },
  { slot: 'tool_sickle',  label: 'Sickle',   icon: '🌿',  hint: 'Gathering & fiber' },
  { slot: 'tool_knife',   label: 'Knife',    icon: '🗡️',  hint: 'Hunting & skinning' },
  { slot: 'tool_pickaxe', label: 'Pickaxe',  icon: '⛏️',  hint: 'Mining & stonecutting' },
  { slot: 'tool_hammer',  label: 'Hammer',   icon: '🔨',  hint: 'Smithing & crafting' },
] as const;

const RARITY_COLORS: Record<string, string> = {
  common:    '',
  uncommon:  'text-green-400',
  rare:      'text-blue-400',
  epic:      'text-purple-400',
  legendary: 'text-amber-400',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function itemFitsSlot(name: string, type: string, slot: string): boolean {
  if (slot === 'weapon')       return type === 'weapon';
  if (slot === 'chest')        return type === 'armor';
  if (slot === 'tool_pickaxe') return type === 'tool' && name.includes('pickaxe');
  if (slot === 'tool_axe')     return type === 'tool' && name.includes('axe') && !name.includes('pickaxe');
  if (slot === 'tool_sickle')  return type === 'tool' && (name.includes('sickle') || name.includes('scythe'));
  if (slot === 'tool_knife')   return type === 'tool' && name.includes('knife');
  if (slot === 'tool_hammer')  return type === 'tool' && name.includes('hammer');
  return false;
}

function statLine(item: { type: string; stats: Record<string, number>; tool_tier: number | null }): string {
  if (item.type === 'weapon' && item.stats.weapon_damage) return `${item.stats.weapon_damage} dmg`;
  if (item.type === 'armor'  && item.stats.armor_rating)  return `${item.stats.armor_rating} armor`;
  if (item.tool_tier)                                      return `Tier ${item.tool_tier}`;
  return '';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EquipmentPanel({ characterId, equipped, available }: Props) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError]   = useState<string | null>(null);

  const equippedBySlot = new Map(equipped.map(e => [e.slot, e]));

  function toggleSlot(slot: string) {
    setSelectedSlot(prev => prev === slot ? null : slot);
    setError(null);
  }

  function handleEquip(item: EquipItemData) {
    setError(null);
    startTransition(async () => {
      try {
        await equipItem(characterId, item.item_id, item.source);
        setSelectedSlot(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to equip');
      }
    });
  }

  function handleUnequip(itemId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await unequipItem(characterId, itemId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to unequip');
      }
    });
  }

  const pickerItems = selectedSlot
    ? available.filter(i => itemFitsSlot(i.name, i.type, selectedSlot))
    : [];

  return (
    <div className="space-y-3">
      {/* Slot grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Weapon + Armor span two rows / special layout */}
        {SLOT_META.map(({ slot, label, icon, hint }) => {
          const eq = equippedBySlot.get(slot);
          const isSelected = selectedSlot === slot;
          const hasOptions = available.some(i => itemFitsSlot(i.name, i.type, slot));

          return (
            <button
              key={slot}
              onClick={() => toggleSlot(slot)}
              disabled={pending}
              className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all disabled:opacity-50 ${
                isSelected
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : eq
                  ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
                  : hasOptions
                  ? 'border-dashed border-border hover:border-primary/40 hover:bg-accent/10'
                  : 'border-dashed border-border/50 opacity-60 cursor-default'
              }`}
            >
              <div className="flex items-center gap-1 w-full">
                <span className="text-sm leading-none">{icon}</span>
                <span className="text-[11px] font-medium text-muted-foreground leading-none">{label}</span>
              </div>
              {eq ? (
                <p className={`text-[11px] font-semibold leading-snug truncate w-full ${RARITY_COLORS[eq.rarity] || ''}`}>
                  {eq.display_name}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground/50 italic leading-snug">{hint}</p>
              )}
              {eq && (
                <span className="text-[10px] text-muted-foreground">{statLine(eq)}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Picker panel */}
      {selectedSlot && (
        <div className="rounded-lg border border-primary/30 bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-primary">
              {SLOT_META.find(s => s.slot === selectedSlot)?.icon}{' '}
              {SLOT_META.find(s => s.slot === selectedSlot)?.label} — choose item
            </p>
            <button
              onClick={() => setSelectedSlot(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>

          {/* Unequip current */}
          {equippedBySlot.get(selectedSlot) && (
            <button
              disabled={pending}
              onClick={() => handleUnequip(equippedBySlot.get(selectedSlot)!.item_id)}
              className="w-full flex items-center justify-between rounded-md border border-border px-3 py-2 text-left hover:border-red-500/40 hover:bg-red-500/5 transition-colors disabled:opacity-40"
            >
              <div>
                <span className="text-xs font-medium">
                  ✕ Unequip {equippedBySlot.get(selectedSlot)!.display_name}
                </span>
              </div>
            </button>
          )}

          {/* Compatible items */}
          {pickerItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3 italic">
              No compatible items in inventory or stash.
            </p>
          ) : (
            <div className="space-y-1.5">
              {pickerItems.map(item => (
                <button
                  key={`${item.source}-${item.item_id}`}
                  disabled={pending}
                  onClick={() => handleEquip(item)}
                  className="w-full flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-40"
                >
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${RARITY_COLORS[item.rarity] || ''}`}>
                      {item.display_name}
                    </span>
                    {statLine(item) && (
                      <span className="ml-2 text-xs text-muted-foreground">{statLine(item)}</span>
                    )}
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] ml-2 shrink-0 ${item.source === 'stash' ? 'opacity-60' : ''}`}
                  >
                    {item.source}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      {equipped.length === 0 && available.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No weapons, armor, or tools found. Craft or find some first.
        </p>
      )}
    </div>
  );
}
