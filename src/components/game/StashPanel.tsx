'use client';

import { useState } from 'react';
import { getResourceIconPath, getResourceInfo } from '@/lib/item-icon';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ItemDef {
  id: string;
  name: string;
  display_name: string;
  type: string;
  image_url: string | null;
  material_subtype?: string | null;
  recipe_for_item_id?: string | null;
  linked_item?: { id: string; image_url: string | null; name: string } | null;
}

interface StashItem {
  instance_id: string;
  item_id: string;
  quantity: number;
  item_rating: string | null;
  tier: number;
  created_at?: string | null;
  item_definitions: ItemDef | null;
}

interface InventoryItem {
  instance_id: string;
  item_id: string;
  quantity: number;
  equipped_slot: string | null;
  item_rating: string | null;
  tier: number;
  item_definitions: ItemDef | null;
}

interface Props {
  stash: StashItem[];
  inventoryEquip: InventoryItem[];
  characterId: string;
}

// ─── Category config ─────────────────────────────────────────────────────────

type Category = 'all' | 'raw' | 'refined' | 'weapon' | 'armor' | 'tool' | 'recipe' | 'other';

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'all',     label: 'All',      icon: '📦' },
  { value: 'raw',     label: 'Raw',      icon: '🪨' },
  { value: 'refined', label: 'Refined',  icon: '⚙️' },
  { value: 'weapon',  label: 'Weapons',  icon: '⚔️' },
  { value: 'armor',   label: 'Armor',    icon: '🛡️' },
  { value: 'tool',    label: 'Tools',    icon: '⛏️' },
  { value: 'recipe',  label: 'Recipes',  icon: '📜' },
  { value: 'other',   label: 'Other',    icon: '✨' },
];

function matchesCategory(def: ItemDef | null, category: Category): boolean {
  if (!def) return category === 'other';
  switch (category) {
    case 'all':     return true;
    case 'raw':     return def.type === 'material' && def.material_subtype === 'raw';
    case 'refined': return def.type === 'material' && def.material_subtype !== 'raw';
    case 'weapon':  return def.type === 'weapon';
    case 'armor':   return def.type === 'armor';
    case 'tool':    return def.type === 'tool';
    case 'recipe':  return def.type === 'recipe';
    case 'other':   return !['material', 'weapon', 'armor', 'tool', 'recipe'].includes(def.type);
  }
}

// ─── Stash grid item ──────────────────────────────────────────────────────────

function StashGridItem({ item }: { item: StashItem; characterId: string }) {
  const def = item.item_definitions;
  const resInfo = getResourceInfo(def?.name ?? '');
  const label = resInfo ? `${resInfo.type} T${resInfo.tier}` : (def?.display_name ?? '?');
  const iconPath = getResourceIconPath(def?.name ?? '');
  const typeIcon = def?.type === 'weapon' ? '⚔️'
    : def?.type === 'armor'  ? '🛡️'
    : def?.type === 'tool'   ? '⛏️'
    : def?.type === 'recipe' ? '📜'
    : '📦';
  const qty = item.quantity;
  const qtyLabel = qty >= 10_000 ? `×${(qty / 1000).toFixed(0)}k` : qty > 1 ? `×${qty}` : null;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isEquip = def?.type === 'weapon' || def?.type === 'armor' || def?.type === 'tool';

  return (
    <div
      title={def?.display_name ?? ''}
      className="relative aspect-square rounded-lg border bg-card overflow-hidden border-border"
    >
      {/* Scroll underlay for recipe items — renders before item image so item appears on top */}
      {def?.type === 'recipe' && supaUrl && (
        <img
          src={`${supaUrl}/storage/v1/object/public/icons/recipe-scroll.png`}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center p-2">
        {iconPath ? (
          <img src={iconPath} alt="" className="w-full h-full object-contain" />
        ) : (() => {
          const displayUrl = def?.image_url ?? (def?.type === 'recipe' ? (def?.linked_item as { image_url: string | null } | null)?.image_url ?? null : null);
          return displayUrl ? (
            <img src={displayUrl} alt="" className={`w-full h-full object-contain ${def?.type === 'recipe' ? 'p-[12%]' : 'p-[10%]'}`} />
          ) : (
            <span className="text-3xl">{typeIcon}</span>
          );
        })()}
      </div>

      {/* Tier frame for equipment */}
      {isEquip && item.tier > 0 && supaUrl && (
        <img
          src={`${supaUrl}/storage/v1/object/public/icons/tier-frames/t${item.tier}.png`}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
      )}

      {/* Quantity — top-right */}
      {qtyLabel && (
        <span
          className="absolute top-1 right-1 text-[11px] tabular-nums font-black text-white leading-none"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {qtyLabel}
        </span>
      )}

      {/* Bottom strip: name */}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5 flex items-center gap-1">
        <p className="text-[10px] text-white/80 leading-tight truncate text-center flex-1">{label}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StashPanel({ stash, inventoryEquip, characterId }: Props) {
  const [activeCategory, setActiveCategory] = useState<Category>('all');

  // For "All", sort by newest first (created_at DESC). Other categories preserve original order.
  const sortedStash = activeCategory === 'all'
    ? [...stash].sort((a, b) => {
        if (!a.created_at || !b.created_at) return 0;
        return b.created_at.localeCompare(a.created_at);
      })
    : stash;

  const filteredStash = sortedStash.filter(item =>
    matchesCategory(item.item_definitions, activeCategory)
  );

  // Equipment from inventory: only shown in "all", "weapon", "armor", "tool" categories
  const showEquipInCategory = ['all', 'weapon', 'armor', 'tool'].includes(activeCategory);
  const filteredEquip = showEquipInCategory
    ? inventoryEquip.filter(item => {
        if (activeCategory === 'all') return true;
        return item.item_definitions?.type === activeCategory;
      })
    : [];

  const totalVisible = filteredStash.length + filteredEquip.length;

  // Count per category for badges
  const categoryCounts: Record<Category, number> = {
    all:     stash.length + inventoryEquip.length,
    raw:     stash.filter(i => matchesCategory(i.item_definitions, 'raw')).length,
    refined: stash.filter(i => matchesCategory(i.item_definitions, 'refined')).length,
    weapon:  stash.filter(i => matchesCategory(i.item_definitions, 'weapon')).length + inventoryEquip.filter(i => i.item_definitions?.type === 'weapon').length,
    armor:   stash.filter(i => matchesCategory(i.item_definitions, 'armor')).length + inventoryEquip.filter(i => i.item_definitions?.type === 'armor').length,
    tool:    stash.filter(i => matchesCategory(i.item_definitions, 'tool')).length + inventoryEquip.filter(i => i.item_definitions?.type === 'tool').length,
    recipe:  stash.filter(i => matchesCategory(i.item_definitions, 'recipe')).length,
    other:   stash.filter(i => matchesCategory(i.item_definitions, 'other')).length,
  };

  return (
    <div className="space-y-3">
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => {
          const count = categoryCounts[cat.value];
          const isActive = activeCategory === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              {count > 0 && (
                <span className={`text-[10px] font-black ${isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {totalVisible === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
          <span className="text-3xl">{CATEGORIES.find(c => c.value === activeCategory)?.icon}</span>
          <p className="text-muted-foreground text-sm">No {CATEGORIES.find(c => c.value === activeCategory)?.label.toLowerCase()} items in stash</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {/* Equipment from inventory rendered as grid squares alongside stash items */}
          {filteredEquip.map(item => {
            const def = item.item_definitions;
            const typeIcon = def?.type === 'weapon' ? '⚔️' : def?.type === 'armor' ? '🛡️' : '⛏️';
            const qtyLabel = (item.quantity ?? 1) > 1 ? `×${item.quantity}` : null;
            const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            return (
              <div key={item.instance_id} title={def?.display_name ?? ''}
                className="relative aspect-square rounded-lg border bg-card overflow-hidden border-border">
                <div className="absolute inset-0 flex items-center justify-center p-2 pb-5">
                  {def?.image_url
                    ? <img src={def.image_url} alt="" className="w-full h-full object-contain p-[10%]" />
                    : <span className="text-3xl">{typeIcon}</span>}
                </div>
                {item.tier > 0 && supaUrl && (
                  <img src={`${supaUrl}/storage/v1/object/public/icons/tier-frames/t${item.tier}.png`}
                    alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                )}
                {qtyLabel && (
                  <span className="absolute top-1 right-1 text-[11px] tabular-nums font-black text-white leading-none"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{qtyLabel}</span>
                )}
                {item.equipped_slot && (
                  <span className="absolute top-1 left-1 text-[10px] font-black text-primary leading-none">✓</span>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5">
                  <p className="text-[10px] text-white/80 leading-tight truncate text-center">{def?.display_name ?? '?'}</p>
                </div>
              </div>
            );
          })}
          {filteredStash.map(item => (
            <StashGridItem key={item.instance_id} item={item} characterId={characterId} />
          ))}
        </div>
      )}
    </div>
  );
}
