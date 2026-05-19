'use client';

import { useState } from 'react';
import Image from 'next/image';
import { RefineButton } from '@/components/game/RefineButton';
import { getResourceIconPath } from '@/lib/item-icon';

const RESOURCE_TYPES = [
  { skillName: 'woodcutting',  label: 'Planks',    refIcon: '/icons/resources/refined/planks.png' },
  { skillName: 'stonecutting', label: 'Cut Stone',  refIcon: '/icons/resources/refined/stone_blocks.png' },
  { skillName: 'smelting',     label: 'Ingots',     refIcon: '/icons/resources/refined/metal_blocks.png' },
  { skillName: 'tanning',      label: 'Leather',    refIcon: '/icons/resources/refined/leather.png' },
  { skillName: 'weaving',      label: 'Cloth',      refIcon: '/icons/resources/refined/cloth.png' },
];

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
  icon: string;
  recipes: Recipe[];
};

interface Props {
  refineGroups: RefineGroup[];
  /** Combined inventory + stash quantity per item name. */
  qtyMap: Record<string, number>;
  characterId: string;
}

export default function HomeRefiningPanel({ refineGroups, qtyMap, characterId }: Props) {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const selectedGroup = refineGroups.find(g => g.skillName === selectedSkill);

  return (
    <div className="space-y-4">
      {/* ── Resource-type picker cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-2">
        {RESOURCE_TYPES.map(rt => {
          const group = refineGroups.find(g => g.skillName === rt.skillName);
          if (!group) return null;
          const active = selectedSkill === rt.skillName;
          return (
            <button
              key={rt.skillName}
              onClick={() => setSelectedSkill(active ? null : rt.skillName)}
              className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl border text-center transition-colors ${
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <Image src={rt.refIcon} alt={rt.label} width={36} height={36} className="object-contain" />
              <span className={`text-xs font-semibold leading-tight ${active ? 'text-primary' : 'text-foreground'}`}>
                {rt.label}
              </span>
              <span className={`text-xs tabular-nums ${active ? 'text-primary' : 'text-muted-foreground'}`}>
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
            const canRefine   = ingredients.every(ing => (qtyMap[ing.name] ?? 0) >= ing.quantity);
            return (
              <div
                key={recipe.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                  canRefine ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  {inputIcon  && <Image src={inputIcon}  alt="" width={20} height={20} className="object-contain opacity-70" />}
                  <span className="text-xs text-muted-foreground">×{ingredients[0]?.quantity ?? 3}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  {outputIcon && <Image src={outputIcon} alt="" width={20} height={20} className="object-contain" />}
                  <span className="text-sm font-medium">Tier {recipe.tier}</span>
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
