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

const CAT_META: Record<string, { label: string; icon: string }> = {
  weapon: { label: 'Weapons', icon: '⚔️' },
  armor:  { label: 'Armor',   icon: '🛡️' },
  tool:   { label: 'Tools',   icon: '⛏️' },
};

type Ingredient = { name: string; label: string; qty: number };
type Recipe = {
  id: string;
  display_name: string;
  output_quantity: number;
  required_skill_level: number;
  ingredients: unknown;
  tier: number;
  category: string;
  item_definitions: { id: string; display_name: string } | null;
};

interface Props {
  recipeList: Recipe[];
  /** Combined inventory + stash quantity per item name. */
  qtyMap: Record<string, number>;
  characterId: string;
}

export default function HomeCraftingPanel({ recipeList, qtyMap, characterId }: Props) {
  const craftRecipes = recipeList.filter(r => r.category !== 'refining');

  // Stable order: weapon → armor → tool → anything else
  const CAT_ORDER = ['weapon', 'armor', 'tool'];
  const categories = [
    ...CAT_ORDER.filter(c => craftRecipes.some(r => r.category === c)),
    ...[...new Set(craftRecipes.map(r => r.category))].filter(c => !CAT_ORDER.includes(c)),
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
    ? craftRecipes.filter(r => r.category === selectedCat)
    : [];

  return (
    <div className="space-y-4">
      {/* ── Category cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {categories.map(cat => {
          const meta  = CAT_META[cat] ?? { label: cat, icon: '📦' };
          const count = craftRecipes.filter(r => r.category === cat).length;
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
            const canCraft    = ingredients.every(ing => (qtyMap[ing.name] ?? 0) >= ing.qty);
            return (
              <div
                key={recipe.id}
                className={`rounded-lg border px-4 py-3 space-y-2 ${
                  canCraft ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/60 bg-card'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">
                      {stripMaterialPrefix(recipe.display_name)} · Tier {recipe.tier}
                    </span>
                    <span className="text-muted-foreground text-xs ml-2">
                      Skill lv {recipe.required_skill_level}+
                    </span>
                  </div>
                  <CraftButton characterId={characterId} recipeId={recipe.id} canCraft={canCraft} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ingredients.map(ing => {
                    const has       = qtyMap[ing.name] ?? 0;
                    const hasEnough = has >= ing.qty;
                    return (
                      <span
                        key={ing.name}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          hasEnough
                            ? 'border-green-500/30 text-green-400 bg-green-500/5'
                            : 'border-border text-muted-foreground'
                        }`}
                      >
                        {ing.label} ×{ing.qty}
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
