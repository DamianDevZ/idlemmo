'use client';

import { useState } from 'react';
import {
  CRAFT_CATEGORIES,
  REFINED_RESOURCES,
  TIER_COLORS,
  TIER_BORDER,
} from '@/config/crafting.config';
import AllocatePointButton from '@/components/game/AllocatePointButton';
import { skillLevelUpCost } from '@/lib/game/formulas';
import { GAME_CONFIG } from '@/config/game.config';

interface AllocProps {
  characterId: string;
  categoryId: string;
  skillId: string;
  cost: number;
  canAllocate: boolean;
}

interface Props {
  /** skill.name → current level */
  skillLevels: Record<string, number>;
  /** skill.name → pre-computed allocate props from server */
  allocBySkill: Record<string, AllocProps>;
}

export default function CraftingPanel({ skillLevels, allocBySkill }: Props) {
  const [catKey, setCatKey] = useState(CRAFT_CATEGORIES[0].key);
  const [recipeKey, setRecipeKey] = useState(CRAFT_CATEGORIES[0].recipes[0].key);
  const [tier, setTier] = useState(0);
  const [qty, setQty] = useState(1);

  const cat = CRAFT_CATEGORIES.find(c => c.key === catKey) ?? CRAFT_CATEGORIES[0];
  const recipe = cat.recipes.find(r => r.key === recipeKey) ?? cat.recipes[0];
  const tierData = recipe.tiers[tier];
  const skillLevel = skillLevels[recipe.skillName] ?? 0;
  const canCraft = skillLevel >= tierData.reqSkill;

  function handleCatChange(key: string) {
    const newCat = CRAFT_CATEGORIES.find(c => c.key === key) ?? CRAFT_CATEGORIES[0];
    setCatKey(key);
    setRecipeKey(newCat.recipes[0].key);
    setTier(0);
  }

  function handleRecipeChange(key: string) {
    setRecipeKey(key);
    setTier(0);
  }

  return (
    <div className="space-y-5">
      {/* ── Category tabs ──────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {CRAFT_CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => handleCatChange(c.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              catKey === c.key
                ? 'bg-primary/10 border-primary text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* ── Skill levels for this category (spend points here) ─────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cat.recipes.map(r => {
          const lvl   = skillLevels[r.skillName] ?? 0;
          const ap    = allocBySkill[r.skillName];
          const cost  = ap?.cost ?? skillLevelUpCost(lvl);
          const isMax = lvl >= GAME_CONFIG.skills.maxSkillLevel;
          return (
            <div
              key={r.key}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                recipeKey === r.key
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border bg-card hover:border-primary/30'
              }`}
              onClick={() => handleRecipeChange(r.key)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl shrink-0">{r.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{r.label}</p>
                  {!isMax && (
                    <p className="text-[10px] text-muted-foreground">next: {cost} pt{cost !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-primary font-bold tabular-nums">{lvl}</span>
                {ap && (
                  <AllocatePointButton
                    characterId={ap.characterId}
                    categoryId={ap.categoryId}
                    skillId={ap.skillId}
                    cost={ap.cost}
                    canAllocate={ap.canAllocate}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Recipe selector ────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap border-t border-border pt-4">
        {cat.recipes.map(r => (
          <button
            key={r.key}
            onClick={() => handleRecipeChange(r.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
              recipeKey === r.key
                ? 'border-primary/60 bg-card text-foreground ring-1 ring-primary/20'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
            }`}
          >
            <span>{r.icon}</span>
            <span className="font-medium">{r.label}</span>
            <span className="text-xs text-muted-foreground">
              Lv {skillLevels[r.skillName] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Tier grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-2">
        {recipe.tiers.map((t, i) => {
          const locked = skillLevel < t.reqSkill;
          const active = tier === i && !locked;
          return (
            <button
              key={i}
              onClick={() => !locked && setTier(i)}
              disabled={locked}
              className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl border text-center transition-all ${
                locked
                  ? 'border-border opacity-40 cursor-not-allowed'
                  : active
                  ? `${TIER_BORDER[i]} bg-card shadow-sm`
                  : 'border-border hover:bg-card/60 cursor-pointer'
              }`}
            >
              <span className="text-xl">{locked ? '🔒' : recipe.icon}</span>
              <span className={`text-[11px] font-bold ${active ? TIER_COLORS[i] : ''}`}>T{i + 1}</span>
              <span className={`text-[9px] leading-tight ${active ? TIER_COLORS[i] : 'text-muted-foreground'}`}>
                {t.name.split(' ').slice(0, 2).join(' ')}
              </span>
              {locked && <span className="text-[9px] text-muted-foreground/60">Lv {t.reqSkill}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Item detail + ingredients ───────────────────────────────────────── */}
      <div className={`rounded-xl border ${TIER_BORDER[tier]} bg-card p-5 space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={`text-xl font-bold ${TIER_COLORS[tier]}`}>{tierData.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Skill:{' '}
              <span className="text-foreground capitalize">
                {recipe.skillName.replace(/_/g, ' ')}
              </span>{' '}
              — requires Lv{' '}
              <span className="text-foreground font-semibold">{tierData.reqSkill}</span>{' '}
              (yours:{' '}
              <span className={canCraft ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                {skillLevel}
              </span>
              )
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-muted-foreground">Qty</label>
            <input
              type="number"
              min={1}
              max={999}
              value={qty}
              onChange={e => setQty(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
              className="w-16 text-center text-sm border border-border rounded-lg bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mb-2">
            Ingredients{qty > 1 ? ` × ${qty}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {tierData.ingredients.map(ing => {
              const refined   = REFINED_RESOURCES.find(r => r.key === ing.refinedKey);
              const itemName  = refined?.tierNames[tier] ?? ing.refinedKey;
              const total     = ing.qty * qty;
              return (
                <div
                  key={ing.refinedKey}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${TIER_BORDER[tier]} bg-background/60`}
                >
                  <span className="text-lg">{refined?.icon ?? '📦'}</span>
                  <div className="leading-tight">
                    <p className={`text-xs font-semibold ${TIER_COLORS[tier]}`}>{itemName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      ×{total}{qty > 1 && <span className="opacity-50"> ({ing.qty} ea)</span>}
                    </p>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-yellow-500/30 bg-background/60">
              <span className="text-lg">🪙</span>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-yellow-400">Gold</p>
                <p className="text-[11px] text-muted-foreground">
                  ×{tierData.goldCost * qty}{qty > 1 && <span className="opacity-50"> ({tierData.goldCost} ea)</span>}
                </p>
              </div>
            </div>
          </div>
        </div>

        {!canCraft && (
          <p className="text-xs text-red-400/80 border border-red-500/20 rounded-lg px-3 py-2 bg-red-500/5">
            ⚠ Requires{' '}
            <span className="capitalize">{recipe.skillName.replace(/_/g, ' ')}</span>{' '}
            Lv {tierData.reqSkill} to craft this tier.
          </p>
        )}
      </div>
    </div>
  );
}
