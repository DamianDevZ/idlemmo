'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { refineItem } from '@/features/home/refine-action';
import { getResourceIconPath } from '@/lib/item-icon';

type Ingredient = { item_id: string; name: string; display_name: string; image_url: string | null; quantity: number };
type Recipe = {
  id: string;
  tier: number;
  output_quantity: number;
  ingredients: unknown;
  item_definitions: { name?: string; display_name?: string; image_url?: string | null } | null;
};
type RefineGroup = {
  skillName: string;
  label: string;
  recipes: Recipe[];
};

interface Props {
  refineGroups: RefineGroup[];
  qtyMap: Record<string, number>;
  characterId: string;
  refiningMasteryMap: Record<string, number>;
}

// ─── Quantity picker ──────────────────────────────────────────────────────────

function QtyPicker({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(1, Math.min(v, Math.max(1, max)));
  const steps = [100, 10, 1];
  return (
    <div className="flex items-center gap-0.5">
      {steps.map(s => (
        <button key={`-${s}`} onClick={() => onChange(clamp(value - s))}
          className="w-8 h-7 rounded border border-border bg-card text-muted-foreground text-xs font-bold hover:border-primary hover:text-foreground transition-colors">
          -{s}
        </button>
      ))}
      <input
        type="number" min={1} max={max}
        value={value}
        onChange={e => onChange(clamp(Number(e.target.value) || 1))}
        className="w-14 h-7 text-center text-xs font-bold bg-card border border-border rounded outline-none focus:border-primary text-foreground"
      />
      {[...steps].reverse().map(s => (
        <button key={`+${s}`} onClick={() => onChange(clamp(value + s))}
          className="w-8 h-7 rounded border border-border bg-card text-muted-foreground text-xs font-bold hover:border-primary hover:text-foreground transition-colors">
          +{s}
        </button>
      ))}
    </div>
  );
}

// ─── Single recipe row ────────────────────────────────────────────────────────

function RefineRow({ recipe, qtyMap, characterId, refiningMasteryMap }: {
  recipe: Recipe;
  qtyMap: Record<string, number>;
  characterId: string;
  refiningMasteryMap: Record<string, number>;
}) {
  const [times, setTimes] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
  const firstIng = ingredients[0];
  const firstIngId = firstIng?.item_id ?? '';
  const masteryTier = refiningMasteryMap[firstIngId] ?? -1;
  const isLocked = recipe.tier > 1 && masteryTier < recipe.tier - 1;

  // Max affordable runs limited by each ingredient
  const maxTimes = isLocked ? 0 : Math.max(0,
    ingredients.length === 0 ? 0 :
    Math.min(...ingredients.map(ing => Math.floor((qtyMap[ing.name] ?? 0) / ing.quantity)))
  );
  const canRefine = !isLocked && times >= 1 && times <= maxTimes;

  const outputDef = recipe.item_definitions;
  const outputIconPath = getResourceIconPath(outputDef?.name ?? '');
  const inputIconPath  = getResourceIconPath(firstIng?.name ?? '');

  function ItemImg({ path, url, size = 24 }: { path: string | null; url?: string | null; size?: number }) {
    const src = path ?? url;
    if (!src) return null;
    return <Image src={src} alt="" width={size} height={size} className="object-contain" />;
  }

  function handleRefine() {
    setError(null);
    startTransition(async () => {
      try {
        await refineItem(characterId, recipe.id, times);
        setTimes(1);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Refine failed');
      }
    });
  }

  return (
    <div className={`rounded-lg border px-3 py-2.5 space-y-2.5 ${
      isLocked ? 'border-border/40 opacity-60' :
      canRefine ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/40'
    }`}>
      {/* Item row: input image → output image, tier, lock, qty available */}
      <div className="flex items-center gap-2 flex-wrap">
        <ItemImg path={inputIconPath} url={firstIng?.image_url} />
        <span className="text-xs text-muted-foreground">×{(firstIng?.quantity ?? 0) * times}</span>
        <span className="text-muted-foreground text-xs">→</span>
        <ItemImg path={outputIconPath} url={outputDef?.image_url} />
        <span className="text-sm font-medium">{outputDef?.display_name ?? ''} Tier {recipe.tier}</span>
        <span className="text-xs text-muted-foreground">×{recipe.output_quantity * times}</span>
        {isLocked && (
          <span className="text-xs text-muted-foreground ml-1">🔒 Refining T{recipe.tier - 1} needed</span>
        )}
        {!isLocked && (
          <span className="text-xs text-muted-foreground ml-auto">
            have: {qtyMap[firstIng?.name ?? ''] ?? 0} → can do ×{maxTimes}
          </span>
        )}
      </div>

      {/* Controls: qty picker + refine button */}
      {!isLocked && (
        <div className="flex items-center gap-2 flex-wrap">
          <QtyPicker value={times} max={maxTimes} onChange={setTimes} />
          <button
            disabled={pending || !canRefine}
            onClick={handleRefine}
            className={`h-7 px-3 rounded border text-xs font-bold transition-colors whitespace-nowrap ${
              canRefine
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'border-border text-muted-foreground opacity-40 cursor-not-allowed'
            } disabled:opacity-40`}
          >
            {pending ? 'Refining…' : '⚒️ Refine'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

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
      {/* Skill selector pills */}
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

      {/* Recipe list */}
      {selectedGroup && (
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
          {selectedGroup.recipes.map(recipe => (
            <RefineRow
              key={recipe.id}
              recipe={recipe}
              qtyMap={qtyMap}
              characterId={characterId}
              refiningMasteryMap={refiningMasteryMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Main panel ───────────────────────────────────────────────────────────────
