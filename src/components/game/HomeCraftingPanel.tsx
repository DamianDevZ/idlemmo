'use client';

import { useState } from 'react';
import { CraftButton } from '@/components/game/CraftButton';

const MATERIAL_WORDS = new Set([
  'Oak', 'Birch', 'Pine', 'Mahogany', 'Ebony', 'Crystal', 'Voidwood', 'Crystalwood',
  'Copper', 'Iron', 'Silver', 'Mithril', 'Void', 'Steel', 'Stone',
  'Cotton', 'Silk', 'Velvet', 'Starweave',
  'Basic', 'Crude', 'Apprentice',
  'Cured', 'Thick', 'Shadow',
]);
function stripMaterialPrefix(displayName: string): string {
  const words = displayName.split(' ');
  let i = 0;
  while (i < words.length - 1 && MATERIAL_WORDS.has(words[i])) i++;
  return words.slice(i).join(' ');
}

/**
 * Single source of truth for item-type display metadata.
 * New item types automatically get a generic fallback — no manual additions needed.
 */
const ITEM_TYPE_META: Record<string, { label: string; icon: string }> = {
  weapon:     { label: 'Weapons',     icon: '⚔️' },
  armor:      { label: 'Armor',       icon: '🛡️' },
  tool:       { label: 'Tools',       icon: '⛏️' },
  consumable: { label: 'Consumables', icon: '🧪' },
  material:   { label: 'Materials',   icon: '🪨' },
  misc:       { label: 'Misc',        icon: '📦' },
};

function itemTypeMeta(type: string | null | undefined) {
  return ITEM_TYPE_META[type ?? ''] ?? { label: type ?? 'Other', icon: '📦' };
}

/** Category key derived from the output item's type (authoritative) */
function recipeCategory(recipe: Recipe): string {
  return recipe.item_definitions?.type ?? recipe.category ?? 'misc';
}

type Ingredient = { item_id: string; name: string; display_name: string; quantity: number };
type Recipe = {
  id: string;
  display_name: string;
  output_quantity: number;
  required_skill_level: number;
  ingredients: unknown;
  tier: number;
  category: string;
  item_definitions: { id: string; display_name: string; type?: string | null } | null;
};

interface Props {
  recipeList: Recipe[];
  /** Combined inventory + stash quantity per item name. */
  qtyMap: Record<string, number>;
  characterId: string;
  /** `${itemDefId}:${category}_crafting` → current mastery tier for that item */
  craftingMasteryMap: Record<string, number>;
}

export default function HomeCraftingPanel({ recipeList, qtyMap, characterId, craftingMasteryMap }: Props) {
  const craftRecipes = recipeList.filter(r => r.category !== 'refining');

  // Categories emerge from the data — ordered by item type priority, then alphabetically.
  // Adding a new item type automatically produces a new category card without code changes.
  const TYPE_ORDER = ['weapon', 'armor', 'tool'];
  const categories = [
    ...TYPE_ORDER.filter(t => craftRecipes.some(r => recipeCategory(r) === t)),
    ...[...new Set(craftRecipes.map(r => recipeCategory(r)))].filter(t => !TYPE_ORDER.includes(t)),
  ];

  const [selectedCat, setSelectedCat] = useState<string | null>(
    categories.length === 1 ? categories[0] : null
  );

  if (craftRecipes.length === 0) {
    return (
      <div className="text-center py-12">
        <span className="text-4xl">🔨</span>
        <p className="text-muted-foreground text-sm mt-3">
          No recipes discovered yet. Explore the world to find crafting knowledge.
        </p>
      </div>
    );
  }

  const filteredRecipes = selectedCat
    ? craftRecipes.filter(r => recipeCategory(r) === selectedCat)
    : [];

  return (
    <div className="space-y-4">
      {/* ── Category cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {categories.map(cat => {
          const meta  = itemTypeMeta(cat);
          const count = craftRecipes.filter(r => recipeCategory(r) === cat).length;
          const active = selectedCat === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCat(active ? null : cat)}
              className={`flex flex-col items-center gap-2 py-5 px-3 rounded-xl border text-center transition-colors ${
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <span className="text-3xl">{meta.icon}</span>
              <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                {meta.label}
              </span>
              <span className="text-xs text-muted-foreground">{count} known</span>
            </button>
          );
        })}
      </div>

      {/* ── Recipe list for selected category ──────────────────────────────── */}
      {selectedCat && filteredRecipes.length > 0 && (
        <div className="space-y-2">
          {filteredRecipes.map(recipe => {
            const outputDef   = recipe.item_definitions;
            const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
            // T2+ recipes are locked until the player's per-item crafting mastery is high enough
              const masteryKey          = `${outputDef?.id}:${recipeCategory(recipe)}_crafting`;
            const currentMasteryTier  = craftingMasteryMap[masteryKey] ?? -1;
            const isLockedByMastery   = recipe.tier > 1 && currentMasteryTier < recipe.tier - 1;
            const canCraft            = !isLockedByMastery && ingredients.every(ing => (qtyMap[ing.name] ?? 0) >= ing.quantity);
            const neededMasteryTier   = recipe.tier - 1;
            return (
              <div
                key={recipe.id}
                className={`rounded-lg border px-4 py-3 space-y-2 ${
                  isLockedByMastery
                    ? 'border-border/40 bg-card opacity-70'
                    : canCraft ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/60 bg-card'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">
                      {stripMaterialPrefix(recipe.display_name)} · Tier {recipe.tier}
                    </span>
                    {isLockedByMastery ? (
                      <span className="text-muted-foreground text-xs ml-2">
                        🔒 {recipe.category} crafting T{neededMasteryTier} needed
                      </span>
                    ) : null}
                  </div>
                  <CraftButton characterId={characterId} recipeId={recipe.id} canCraft={canCraft} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ingredients.map(ing => {
                    const has       = qtyMap[ing.name] ?? 0;
                    const hasEnough = has >= ing.quantity;
                    return (
                      <span
                        key={ing.item_id}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          hasEnough
                            ? 'border-green-500/30 text-green-400 bg-green-500/5'
                            : 'border-border text-muted-foreground'
                        }`}
                      >
                        {ing.display_name} ×{ing.quantity}
                        {has > 0 && !hasEnough && (
                          <span className="opacity-60"> ({has})</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
