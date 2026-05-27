'use client';

import { useState } from 'react';
import Image from 'next/image';
import { RefineButton } from '@/components/game/RefineButton';
import { getResourceIconPath } from '@/lib/item-icon';
type Ingredient = { item_id: string; name: string; display_name: string; quantity: number };
type Recipe = {
  id: string;
  tier: number;
  ingredients: unknown;
  item_definitions: { name?: string } | null;
};
type RefineGroup = {
  skillName: string;
  label: string;
  recipes: Recipe[];
};

interface Props {
  refineGroups: RefineGroup[];
  /** Combined inventory + stash quantity per item name. */
  qtyMap: Record<string, number>;
  characterId: string;
  /** ingredientItemId → current mastery tier in 'refining' category */
  refiningMasteryMap: Record<string, number>;
}

export default function HomeRefiningPanel({ refineGroups, qtyMap, characterId, refiningMasteryMap }: Props) {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const selectedGroup = refineGroups.find(g => g.skillName === selectedSkill);

  if (refineGroups.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <span className="text-4xl">⚒️</span>
        <p className="text-muted-foreground text-sm">No refining recipes found. Check back later!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Resource-type picker — derived from whatever skills exist in the data ── */}
      <div className="flex flex-wrap gap-2">
        {refineGroups.map(group => {
          const active = selectedSkill === group.skillName;
          return (
            <button
              key={group.skillName}
              onClick={() => setSelectedSkill(active ? null : group.skillName)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:border-primary/40'
              }`}
            >
              {group.label}
              <span className={`text-xs tabular-nums font-normal ${active ? 'text-primary/70' : 'text-muted-foreground'}`}>
                {group.recipes.length} tier{group.recipes.length !== 1 ? 's' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Detail panel for selected resource type ────────────────────────── */}
      {selectedGroup && (
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">3 raw → 2 refined</p>
          {selectedGroup.recipes.map(recipe => {
            const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
            const outputDef   = recipe.item_definitions;
            const outputIcon  = getResourceIconPath(outputDef?.name ?? '');
            const inputIcon   = getResourceIconPath(ingredients[0]?.name ?? '');
            // T2+ recipes are locked until the player's refining mastery for the input material is high enough
            const firstIngId        = ingredients[0]?.item_id ?? '';
            const currentMasteryTier = refiningMasteryMap[firstIngId] ?? -1;
            const isLockedByMastery  = recipe.tier > 1 && currentMasteryTier < recipe.tier - 1;
            const canRefine          = !isLockedByMastery && ingredients.every(ing => (qtyMap[ing.name] ?? 0) >= ing.quantity);
            return (
              <div
                key={recipe.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                  isLockedByMastery
                    ? 'border-border/40 opacity-60'
                    : canRefine ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  {inputIcon  && <Image src={inputIcon}  alt="" width={20} height={20} className="object-contain opacity-70" />}
                  <span className="text-xs text-muted-foreground">×{ingredients[0]?.quantity ?? 3}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  {outputIcon && <Image src={outputIcon} alt="" width={20} height={20} className="object-contain" />}
                  <span className="text-sm font-medium">Tier {recipe.tier}</span>
                  {isLockedByMastery && (
                    <span className="text-xs text-muted-foreground">🔒 Refining T{recipe.tier - 1} needed</span>
                  )}
                </div>
                <RefineButton characterId={characterId} recipeId={recipe.id} canRefine={canRefine} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
