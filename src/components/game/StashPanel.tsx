'use client';

import { useState, useTransition } from 'react';
import { getResourceIconPath, getResourceInfo } from '@/lib/item-icon';
import { ItemSprite } from '@/components/game/ItemSprite';
import { useRecipeScroll } from '@/features/home/use-scroll-action';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ItemDef {
  id: string;
  name: string;
  display_name: string;
  type: string;
  image_url: string | null;
  material_subtype?: string | null;
  recipe_for_item_id?: string | null;
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

// ─── Use-scroll button ────────────────────────────────────────────────────────

function UseScrollButton({ characterId, instanceId }: { characterId: string; instanceId: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleUse() {
    startTransition(async () => {
      try {
        await useRecipeScroll(characterId, instanceId);
        setDone(true);
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Failed to use scroll');
      }
    });
  }

  if (done) return <span className="text-[10px] text-green-400 font-bold">Learned!</span>;
  return (
    <button
      disabled={pending}
      onClick={handleUse}
      className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 leading-tight"
    >
      {pending ? '…' : 'Use'}
    </button>
  );
}

// ─── Stash grid item ──────────────────────────────────────────────────────────

function StashGridItem({ item, characterId }: { item: StashItem; characterId: string }) {
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
  const isRecipeScroll = def?.type === 'recipe';

  return (
    <div
      title={def?.display_name ?? ''}
      className="relative aspect-square rounded-lg border bg-card overflow-hidden border-border"
    >
      {/* Icon */}
      <div className="absolute inset-0 flex items-center justify-center p-2">
        {iconPath ? (
          <img src={iconPath} alt="" className="w-full h-full object-contain" />
        ) : def?.image_url ? (
          <img src={def.image_url} alt="" className="w-full h-full object-contain p-[10%]" />
        ) : (
          <span className="text-3xl">{typeIcon}</span>
        )}
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

      {/* Bottom strip: name + optional Use button */}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5 flex items-center gap-1">
        <p className="text-[10px] text-white/80 leading-tight truncate flex-1">{label}</p>
        {isRecipeScroll && (
          <UseScrollButton characterId={characterId} instanceId={item.instance_id} />
        )}
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
        <div className="space-y-4">
          {/* Equipment from inventory (only in "All" / weapon / armor / tool) */}
          {filteredEquip.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold px-0.5">Equipment</p>
              <div className="grid grid-cols-2 gap-2">
                {filteredEquip.map(item => {
                  const def = item.item_definitions;
                  return (
                    <div
                      key={item.instance_id}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg border bg-card border-border"
                    >
                      <ItemSprite
                        imageUrl={def?.image_url ?? null}
                        tier={item.tier}
                        size={40}
                        className="shrink-0"
                        fallback={<span className="text-xl">{def?.type === 'tool' ? '⛏️' : def?.type === 'weapon' ? '⚔️' : '🛡️'}</span>}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-foreground">{def?.display_name ?? 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground capitalize">{def?.type}</p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${item.equipped_slot ? 'text-primary' : 'text-muted-foreground'}`}>
                        {item.equipped_slot ? '✓' : 'bag'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stash grid */}
          {filteredStash.length > 0 && (
            <div className="space-y-1.5">
              {filteredEquip.length > 0 && (
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold px-0.5">Stored</p>
              )}
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {filteredStash.map(item => (
                  <StashGridItem key={item.instance_id} item={item} characterId={characterId} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
