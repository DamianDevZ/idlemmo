'use client';

import { useState } from 'react';
import { getResourceIconPath, getResourceInfo } from '@/lib/item-icon';
import { CraftButton } from '@/components/game/CraftButton';

// ─── Types ────────────────────────────────────────────────────────────────────

type Ingredient = {
  item_id: string;
  name: string;
  display_name: string;
  image_url: string | null;
  quantity: number;
};

type RecipeTier = {
  id: string;
  output_tier: number;
  tier: number;
  display_name: string;
  output_quantity: number;
  ingredients: Ingredient[];
};

export type CraftableItem = {
  id: string;
  name: string;
  display_name: string;
  type: string;
  image_url: string | null;
  /** Current mastery tier for this item (-1 = none) */
  masteryTier: number;
  recipes: RecipeTier[];
};

interface Props {
  craftableItems: CraftableItem[];
  qtyMap: Record<string, number>;
  characterId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ITEM_TYPE_META: Record<string, { label: string; icon: string }> = {
  weapon:     { label: 'Weapons',     icon: '⚔️' },
  armor:      { label: 'Armor',       icon: '🛡️' },
  tool:       { label: 'Tools',       icon: '⛏️' },
  consumable: { label: 'Consumables', icon: '🧪' },
  material:   { label: 'Materials',   icon: '🪨' },
};
const TYPE_ORDER = ['weapon', 'armor', 'tool', 'consumable', 'material'];

function typeMeta(type: string) {
  return ITEM_TYPE_META[type] ?? { label: type.charAt(0).toUpperCase() + type.slice(1), icon: '📦' };
}

// ─── Ingredient chip ──────────────────────────────────────────────────────────

function IngredientChip({ ing, qtyMap }: { ing: Ingredient; qtyMap: Record<string, number> }) {
  const has = qtyMap[ing.name] ?? 0;
  const hasEnough = has >= ing.quantity;
  const iconPath = getResourceIconPath(ing.name);

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
      hasEnough
        ? 'border-green-500/30 bg-green-500/5 text-green-400'
        : 'border-border bg-card text-muted-foreground'
    }`}>
      <span className="shrink-0 w-5 h-5 flex items-center justify-center">
        {iconPath ? (
          <img src={iconPath} alt="" className="w-full h-full object-contain" />
        ) : ing.image_url ? (
          <img src={ing.image_url} alt="" className="w-full h-full object-contain" />
        ) : (
          <span className="text-sm">📦</span>
        )}
      </span>
      <span className="font-medium">{ing.display_name}</span>
      <span className={`tabular-nums font-black ${hasEnough ? '' : 'text-destructive/80'}`}>
        ×{ing.quantity}
      </span>
      {has > 0 && !hasEnough && (
        <span className="opacity-60">({has})</span>
      )}
    </div>
  );
}

// ─── Item square ──────────────────────────────────────────────────────────────

function CraftItemSquare({
  item,
  isSelected,
  onClick,
}: {
  item: CraftableItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const meta = typeMeta(item.type);
  return (
    <button
      onClick={onClick}
      title={item.display_name}
      className={`relative aspect-square rounded-lg border overflow-hidden transition-all ${
        isSelected
          ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
          : 'border-border bg-card hover:border-primary/50'
      }`}
    >
      <div className="absolute inset-0 flex items-center justify-center p-2 pb-5">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="w-full h-full object-contain p-[10%]" />
        ) : (
          <span className="text-3xl">{meta.icon}</span>
        )}
      </div>
      <div className={`absolute bottom-0 inset-x-0 px-1 py-0.5 ${isSelected ? 'bg-primary/30' : 'bg-black/50'}`}>
        <p className="text-[10px] text-white/90 text-center leading-tight truncate">{item.display_name}</p>
      </div>
    </button>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function CraftDetailPanel({
  item,
  qtyMap,
  characterId,
}: {
  item: CraftableItem;
  qtyMap: Record<string, number>;
  characterId: string;
}) {
  const [selectedTier, setSelectedTier] = useState<number>(item.recipes[0]?.output_tier ?? 1);
  const recipe = item.recipes.find(r => r.output_tier === selectedTier) ?? item.recipes[0];
  if (!recipe) return null;

  const isLocked = recipe.tier > 1 && item.masteryTier < recipe.tier - 1;
  const canCraft = !isLocked && recipe.ingredients.every(ing => (qtyMap[ing.name] ?? 0) >= ing.quantity);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg border border-border bg-background flex items-center justify-center shrink-0 overflow-hidden">
          {item.image_url ? (
            <img src={item.image_url} alt="" className="w-full h-full object-contain p-1" />
          ) : (
            <span className="text-2xl">{typeMeta(item.type).icon}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground">{item.display_name}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {item.type} crafting · Mastery {item.masteryTier < 0 ? 'T0' : `T${item.masteryTier}`}
          </p>
        </div>
      </div>

      {/* Tier selector */}
      {item.recipes.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Select tier</p>
          <div className="flex flex-wrap gap-1.5">
            {item.recipes.map(r => {
              const locked = r.tier > 1 && item.masteryTier < r.tier - 1;
              const active = r.output_tier === selectedTier;
              return (
                <button
                  key={r.id}
                  disabled={locked}
                  onClick={() => setSelectedTier(r.output_tier)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : locked
                        ? 'bg-card border border-border/40 text-muted-foreground/40 cursor-not-allowed'
                        : 'bg-card border border-border text-muted-foreground hover:border-primary hover:text-foreground'
                  }`}
                >
                  {locked ? '🔒 ' : ''}T{r.output_tier}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ingredients */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          Materials needed · Tier {recipe.output_tier}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {recipe.ingredients.map(ing => (
            <IngredientChip key={ing.item_id} ing={ing} qtyMap={qtyMap} />
          ))}
        </div>
      </div>

      {/* Craft button */}
      <div className="flex items-center justify-between pt-1">
        {isLocked ? (
          <p className="text-xs text-muted-foreground">🔒 Requires {item.type} crafting mastery T{recipe.tier - 1}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{canCraft ? 'Ready to craft!' : 'Missing materials'}</p>
        )}
        <CraftButton characterId={characterId} recipeId={recipe.id} canCraft={canCraft} />
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function HomeCraftingPanel({ craftableItems, qtyMap, characterId }: Props) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  if (craftableItems.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <span className="text-4xl">📜</span>
        <p className="text-muted-foreground text-sm">No recipe scrolls in your stash. Find them while exploring!</p>
      </div>
    );
  }

  const availableTypes = [
    ...TYPE_ORDER.filter(t => craftableItems.some(i => i.type === t)),
    ...[...new Set(craftableItems.map(i => i.type))].filter(t => !TYPE_ORDER.includes(t)),
  ];

  const filteredItems = selectedType ? craftableItems.filter(i => i.type === selectedType) : craftableItems;
  const selectedItem = craftableItems.find(i => i.id === selectedItemId) ?? null;

  return (
    <div className="space-y-4">
      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => { setSelectedType(null); setSelectedItemId(null); }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
            !selectedType
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border text-muted-foreground hover:border-primary hover:text-foreground'
          }`}
        >
          📦 All <span className="text-[10px] font-black opacity-70">{craftableItems.length}</span>
        </button>
        {availableTypes.map(type => {
          const meta = typeMeta(type);
          const count = craftableItems.filter(i => i.type === type).length;
          const isActive = selectedType === type;
          return (
            <button
              key={type}
              onClick={() => { setSelectedType(isActive ? null : type); setSelectedItemId(null); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              {meta.icon} {meta.label} <span className="text-[10px] font-black opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Item grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {filteredItems.map(item => (
          <CraftItemSquare
            key={item.id}
            item={item}
            isSelected={selectedItemId === item.id}
            onClick={() => setSelectedItemId(prev => (prev === item.id ? null : item.id))}
          />
        ))}
      </div>

      {/* Detail panel */}
      {selectedItem && (
        <CraftDetailPanel item={selectedItem} qtyMap={qtyMap} characterId={characterId} />
      )}
    </div>
  );
}
