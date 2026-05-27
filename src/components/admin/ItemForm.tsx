'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertItem, uploadItemIcon, deleteItem } from '@/features/admin/item-actions';
import type { RecipeFormData, RecipeIngredient } from '@/features/admin/item-actions';

// ── Types ──────────────────────────────────────────────────────────────────────

type ResistanceMode = 'percent' | 'flat';
type ResistanceEntry = { value: number; mode: ResistanceMode };
type ResistancesMap = Record<string, ResistanceEntry>;

type EffectTrigger = 'instant' | 'buff' | 'on_hit';
type ConsumableEffect = {
  trigger: EffectTrigger;
  target: string;
  value: number;
  duration_seconds?: number; // buff only
  hit_count?: number;        // on_hit only
};

type Item = {
  id?: string;
  name: string;
  display_name: string;
  type: string;
  description: string;
  stackable: boolean;
  equipment_tier: number | null;
  base_damage: number | null;
  base_defense: number | null;
  primary_damage_type: string | null;
  material_type: string | null;
  primary_scaling_attr: string | null;
  secondary_scaling_attr: string | null;
  image_url: string | null;
  resistances?: ResistancesMap;
  required_mastery_skill_id: string | null;
  required_mastery_level: number;
  material_subtype: string | null;
  gathering_skill_id: string | null;
  is_tiered: boolean;
  tiered_stats: string[];
  consumable_effects: ConsumableEffect[];
  tool_config: ToolConfig;
  weapon_type_id: string | null;
  compatible_weapon_type_ids: string[];
  attack_speed: number;
  tool_slot: string | null;
  // Per-item drop grade weight overrides (null = use global defaults from game_config)
  grade_weights: { S?: number; A?: number; B?: number; C?: number; D?: number; F?: number } | null;
};

type ToolConfig = {
  yield_min: number;
  yield_max: number;
  above_penalty: number;       // % reduction for gathering one tier above
  below_bonus_base: number;    // % bonus for gathering one tier below
  below_bonus_growth: number;  // compound growth % per additional tier below
                               // bonus(n) = below_bonus_base * (1 + below_bonus_growth/100)^(n-1)
};

export type SkillOption    = { id: string; name: string; display_name: string; category: string };
export type MaterialItem   = { id: string; name: string; display_name: string; equipment_tier: number | null; is_tiered: boolean };
export type WeaponType     = { id: string; name: string; display_name: string };
export type TierScalingRow = { id?: string; item_type: string; stat_key: string; stat_label: string; tier: number; multiplier: number };

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPES = ['material','tool','weapon','armor','consumable','misc','special_attack'];
const DAMAGE_TYPES = ['slash','pierce','blunt','bleed','fire','ice','poison','lightning','true'];
// Resistance grid excludes 'true' — true damage bypasses all armor
const RESIST_TYPES: { key: string; label: string; emoji: string }[] = [
  { key: 'slash',     label: 'Slash',     emoji: '⚔️' },
  { key: 'fire',      label: 'Fire',      emoji: '🔥' },
  { key: 'pierce',    label: 'Pierce',    emoji: '🏹' },
  { key: 'ice',       label: 'Ice',       emoji: '❄️' },
  { key: 'blunt',     label: 'Blunt',     emoji: '🔨' },
  { key: 'poison',    label: 'Poison',    emoji: '☠️' },
  { key: 'bleed',     label: 'Bleed',     emoji: '🩸' },
  { key: 'lightning', label: 'Lightning', emoji: '⚡' },
];
// Consumable effects constants
const EFFECT_TRIGGERS: { value: EffectTrigger; label: string; hint: string }[] = [
  { value: 'instant', label: 'Instant',  hint: 'Applied once, immediately on use' },
  { value: 'buff',    label: 'Buff',     hint: 'Stat modifier active for N seconds' },
  { value: 'on_hit',  label: 'On-hit',  hint: 'Procs on each hit for N hits' },
];

const EFFECT_TARGET_GROUPS: { group: string; targets: { key: string; label: string }[] }[] = [
  {
    group: 'Attributes',
    targets: [
      { key: 'str', label: 'Strength' },
      { key: 'dex', label: 'Dexterity' },
      { key: 'int', label: 'Intelligence' },
      { key: 'vit', label: 'Vitality' },
      { key: 'luk', label: 'Luck' },
    ],
  },
  {
    group: 'Stats',
    targets: [
      { key: 'hp',   label: 'HP' },
      { key: 'mp',   label: 'MP' },
      { key: 'rage', label: 'Rage' },
    ],
  },
  {
    group: 'On-hit Damage',
    targets: [
      { key: 'fire_damage',      label: 'Fire' },
      { key: 'ice_damage',       label: 'Ice' },
      { key: 'poison_damage',    label: 'Poison' },
      { key: 'lightning_damage', label: 'Lightning' },
      { key: 'bleed_damage',     label: 'Bleed' },
      { key: 'slash_damage',     label: 'Slash' },
      { key: 'pierce_damage',    label: 'Pierce' },
      { key: 'blunt_damage',     label: 'Blunt' },
    ],
  },
];

const BLANK_EFFECT: ConsumableEffect = { trigger: 'instant', target: 'hp', value: 0 };

const TYPES_LABELS: Record<string, string> = { special_attack: 'Ultimate' };

const MATERIAL_TYPES = ['metal','leather','cloth'];
const SCALE_ATTRS = ['str','dex','int'];
const GRADES = ['S','A','B','C','D','F'];


const BLANK_TOOL_CONFIG: ToolConfig = {
  yield_min: 1,
  yield_max: 3,
  above_penalty: 100,
  below_bonus_base: 100,
  below_bonus_growth: 50,
};

const BLANK_RECIPE: Omit<RecipeFormData, 'output_tier'> = {
  display_name: '',
  output_quantity: 1,
  required_skill_id: '',
  required_skill_level: 1,
  ingredients: [],
  craft_time_seconds: 30,
};

function blankRecipe(output_tier: number): RecipeFormData {
  return { ...BLANK_RECIPE, output_tier };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {children}
    </select>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────

function initResistances(raw?: ResistancesMap): ResistancesMap {
  const base: ResistancesMap = {};
  for (const { key } of RESIST_TYPES) {
    base[key] = { value: 0, mode: 'percent' };
  }
  if (raw && typeof raw === 'object') {
    for (const { key } of RESIST_TYPES) {
      const entry = raw[key];
      if (entry) base[key] = entry;
    }
  }
  return base;
}

const STAT_FALLBACK_LABELS: Record<string, string> = {
  base_damage:  'Base Damage',
  attack_speed: 'Attack Speed',
  base_defense: 'Base Defense',
  yield_min:    'Yield Min',
  yield_max:    'Yield Max',
};

function TierScalingPreview({
  itemType, tieredStats, baseDamage, baseDefense, baseSpeed, yieldMin, yieldMax, tierScaling, maxTier,
}: {
  itemType: string;
  tieredStats: string[];
  baseDamage: number | null;
  baseDefense: number | null;
  baseSpeed: number;
  yieldMin: number | null;
  yieldMax: number | null;
  tierScaling: TierScalingRow[];
  maxTier: number;
}) {
  const relevant = tierScaling.filter(r => r.item_type === itemType);
  const tierNums = Array.from({ length: maxTier }, (_, i) => i + 1);
  const statMap = relevant.reduce<Record<string, { label: string; tiers: Record<number, number> }>>((acc, r) => {
    if (!acc[r.stat_key]) acc[r.stat_key] = { label: r.stat_label, tiers: {} };
    acc[r.stat_key].tiers[r.tier] = r.multiplier;
    return acc;
  }, {});

  function getBase(stat_key: string): number | null {
    switch (stat_key) {
      case 'base_damage':  return baseDamage;
      case 'base_defense': return baseDefense;
      case 'yield_min':    return yieldMin;
      case 'yield_max':    return yieldMax;
      case 'attack_speed': return baseSpeed;
      default:             return null;
    }
  }

  // DPS only makes sense when base_damage is one of the scaled stats
  const showDps = itemType === 'weapon'
    && tieredStats.includes('base_damage')
    && (baseDamage ?? 0) > 0;

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tier scaling preview</p>
        <a href="/admin/tier-scaling" target="_blank" className="text-[10px] text-primary hover:underline">Edit scaling →</a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-muted-foreground font-medium pb-1 pr-3">Tier</th>
              {tieredStats.map(k => (
                <th key={k} className="text-right text-muted-foreground font-medium pb-1 px-2">
                  {statMap[k]?.label ?? STAT_FALLBACK_LABELS[k] ?? k}
                </th>
              ))}
              {showDps && <th className="text-right text-muted-foreground font-medium pb-1 px-2">DPS</th>}
            </tr>
          </thead>
          <tbody>
            {tierNums.map(t => {
              const dmgMult = statMap['base_damage']?.tiers[t]  ?? 1.0;
              const spdMult = statMap['attack_speed']?.tiers[t] ?? 1.0;
              const dps     = (baseDamage ?? 0) * dmgMult * baseSpeed * spdMult;
              return (
                <tr key={t} className={t % 2 === 0 ? 'bg-card/50' : ''}>
                  <td className="py-0.5 pr-3 text-muted-foreground">T{t}</td>
                  {tieredStats.map(k => {
                    const base      = getBase(k);
                    const mult      = statMap[k]?.tiers[t];
                    const hasConfig = !!statMap[k];
                    if (!hasConfig) {
                      return <td key={k} className="py-0.5 px-2 text-right text-muted-foreground italic">N/A</td>;
                    }
                    return (
                      <td key={k} className="py-0.5 px-2 text-right text-body tabular-nums">
                        {base != null && mult != null
                          ? (base * mult).toFixed(2).replace(/\.?0+$/, '') || '0'
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
                  {showDps && (
                    <td className="py-0.5 px-2 text-right font-semibold text-body tabular-nums">
                      {dps.toFixed(1)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ItemForm({
  initial,
  recipes: initialRecipes = [],
  skills,
  materialItems,
  weaponTypes,
  maxTier,
  tierScaling,
  returnTo = '/admin/items',
  recipeSuffix = 'Scroll',
  existingRecipeItem = null,
}: {
  initial: Item;
  recipes?: RecipeFormData[];
  skills: SkillOption[];
  materialItems: MaterialItem[];
  weaponTypes: WeaponType[];
  maxTier: number;
  tierScaling: TierScalingRow[];
  returnTo?: string;
  recipeSuffix?: string;
  existingRecipeItem?: { id: string; display_name: string } | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<Item>(initial);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [resistances, setResistances] = useState<ResistancesMap>(() => initResistances(initial.resistances));
  const [effects, setEffects] = useState<ConsumableEffect[]>(initial.consumable_effects ?? []);
  const [toolConfig, setToolConfig] = useState<ToolConfig>(
    (initial.tool_config && Object.keys(initial.tool_config).length > 0)
      ? initial.tool_config
      : { ...BLANK_TOOL_CONFIG }
  );
  // Map of output_tier → RecipeFormData|null for all tiers
  // output_tier=0 = non-tiered item recipe; 1..N = per-tier recipe
  const [tierRecipes, setTierRecipes] = useState<Record<number, RecipeFormData | null>>(() => {
    const map: Record<number, RecipeFormData | null> = {};
    for (const r of initialRecipes) {
      map[r.output_tier] = r;
    }
    return map;
  });
  // Which tier tab is active in the recipe editor (0 = non-tiered, 1..N = tiered)
  const [activeRecipeTier, setActiveRecipeTier] = useState<number>(initial.is_tiered ? 1 : 0);
  // Derived: the recipe being shown/edited right now
  const recipe = tierRecipes[activeRecipeTier] ?? null;

  const isNew = !initial.id;

  // Skill level IS the tier number in the new XP system.
  function tierToLevel(tier: number): number {
    return tier;
  }

  const tierOptions = Array.from({ length: maxTier }, (_, i) => i + 1);

  function set<K extends keyof Item>(key: K, value: Item[K]) {
    setItem(prev => ({ ...prev, [key]: value }));
  }

  function setResist(dmgType: string, field: keyof ResistanceEntry, value: string | number) {
    setResistances(prev => ({
      ...prev,
      [dmgType]: { ...prev[dmgType], [field]: value },
    }));
  }

  function setTool<K extends keyof ToolConfig>(key: K, value: ToolConfig[K]) {
    setToolConfig(prev => ({ ...prev, [key]: value }));
  }

  function setGradeWeight(grade: string, raw: string) {
    const num = raw === '' ? undefined : Number(raw);
    const current: Record<string, number> = { ...(item.grade_weights ?? {}) };
    if (num === undefined || isNaN(num)) {
      delete current[grade];
    } else {
      current[grade] = num;
    }
    set('grade_weights', Object.keys(current).length === 0 ? null : (current as Item['grade_weights']));
  }

  // Compute the bonus for each tier below: bonus(n) = base * (1 + growth/100)^(n-1)
  function belowBonusAtStep(n: number): number {
    if (n < 1) return 0;
    return toolConfig.below_bonus_base * Math.pow(1 + toolConfig.below_bonus_growth / 100, n - 1);
  }

  function setRecipeField<K extends keyof RecipeFormData>(key: K, value: RecipeFormData[K]) {
    setTierRecipes(prev => {
      const cur = prev[activeRecipeTier] ?? blankRecipe(activeRecipeTier);
      return { ...prev, [activeRecipeTier]: { ...cur, [key]: value } };
    });
  }

  // Creates blank recipe stubs for every tier at once (tiered) or T0 (non-tiered)
  function makeAllCraftable() {
    if (item.is_tiered) {
      const map: Record<number, RecipeFormData> = {};
      for (let t = 1; t <= maxTier; t++) {
        map[t] = tierRecipes[t] ?? blankRecipe(t);
      }
      setTierRecipes(map);
      setActiveRecipeTier(1);
    } else {
      setTierRecipes(prev => ({ ...prev, 0: prev[0] ?? blankRecipe(0) }));
      setActiveRecipeTier(0);
    }
  }

  // Copies the active tier's recipe to every tier above — same ingredient tiers verbatim
  function duplicateToFollowing() {
    if (!recipe) return;
    const src = activeRecipeTier;
    setTierRecipes(prev => {
      const next = { ...prev };
      for (let t = src + 1; t <= maxTier; t++) {
        next[t] = {
          ...recipe,
          id: prev[t]?.id,
          output_tier: t,
          // ingredient tiers stay exactly as-is
          ingredients: recipe.ingredients.map(ing => ({ ...ing })),
        };
      }
      return next;
    });
  }

  // Copies the active tier's recipe to every tier above — ingredient tiers are set to match the target tier
  function matchToTier() {
    if (!recipe) return;
    const src = activeRecipeTier;
    setTierRecipes(prev => {
      const next = { ...prev };
      for (let t = src + 1; t <= maxTier; t++) {
        next[t] = {
          ...recipe,
          id: prev[t]?.id,
          output_tier: t,
          // each ingredient's tier becomes the destination tier
          ingredients: recipe.ingredients.map(ing => ({
            ...ing,
            tier: ing.tier != null ? t : null,
          })),
        };
      }
      return next;
    });
  }

  // Copies the active tier's recipe to every tier above — ingredient tiers increase by +1 per tier step
  function increasePerTier() {
    if (!recipe) return;
    const src = activeRecipeTier;
    setTierRecipes(prev => {
      const next = { ...prev };
      for (let t = src + 1; t <= maxTier; t++) {
        const delta = t - src;
        next[t] = {
          ...recipe,
          id: prev[t]?.id,
          output_tier: t,
          ingredients: recipe.ingredients.map(ing => ({
            ...ing,
            tier: ing.tier != null ? Math.min(ing.tier + delta, maxTier) : null,
          })),
        };
      }
      return next;
    });
  }

  function addIngredient() {
    setTierRecipes(prev => {
      const cur = prev[activeRecipeTier];
      if (!cur) return prev;
      return { ...prev, [activeRecipeTier]: { ...cur, ingredients: [...cur.ingredients, { item_id: '', tier: null, quantity: 1 }] } };
    });
  }

  function removeIngredient(i: number) {
    setTierRecipes(prev => {
      const cur = prev[activeRecipeTier];
      if (!cur) return prev;
      return { ...prev, [activeRecipeTier]: { ...cur, ingredients: cur.ingredients.filter((_, idx) => idx !== i) } };
    });
  }

  function setIngredient(i: number, patch: Partial<RecipeIngredient>) {
    setTierRecipes(prev => {
      const cur = prev[activeRecipeTier];
      if (!cur) return prev;
      const next = [...cur.ingredients];
      next[i] = { ...next[i], ...patch };
      return { ...prev, [activeRecipeTier]: { ...cur, ingredients: next } };
    });
  }

  function toggleTieredStat(stat: string) {
    set('tiered_stats', item.tiered_stats.includes(stat)
      ? item.tiered_stats.filter(s => s !== stat)
      : [...item.tiered_stats, stat]);
  }

  function addEffect() {
    setEffects(prev => [...prev, { ...BLANK_EFFECT }]);
  }

  function removeEffect(i: number) {
    setEffects(prev => prev.filter((_, idx) => idx !== i));
  }

  function setEffect(i: number, patch: Partial<ConsumableEffect>) {
    setEffects(prev => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      // Clear fields that don't apply to the new trigger
      if (patch.trigger) {
        if (patch.trigger !== 'buff')   delete next[i].duration_seconds;
        if (patch.trigger !== 'on_hit') delete next[i].hit_count;
      }
      return next;
    });
  }

  function handleTierChange(tier: number | null) {
    set('equipment_tier', tier);
    if (tier) {
      const lvl = tierToLevel(tier);
      set('required_mastery_level', lvl);
      // For non-tiered items with a single recipe at tier 0, auto-update skill level
      if (!item.is_tiered) {
        setTierRecipes(prev => {
          const cur = prev[0];
          return cur ? { ...prev, 0: { ...cur, required_skill_level: lvl } } : prev;
        });
      }
    }
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const recipesToSave = Object.entries(tierRecipes)
          .filter(([, r]) => r !== null)
          .map(([tier, r]) => ({ ...r!, output_tier: Number(tier) }));
        const result = await upsertItem(
          initial.id ?? null,
          { ...item, resistances, consumable_effects: effects, tool_config: toolConfig },
          recipesToSave,
          recipeSuffix,
        );
        if (result?.error) { setError(result.error); return; }
        // If a file was selected before saving (new item), upload it now using the returned ID
        if (pendingFile && result.id) {
          const fd = new FormData();
          fd.append('icon', pendingFile);
          await uploadItemIcon(result.id, fd);
        }
        router.push(returnTo);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleDelete() {
    if (!initial.id) return;
    if (!confirm(`Delete "${item.display_name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        const result = await deleteItem(initial.id!);
        if (result?.error) { setError(result.error); return; }
        router.push(returnTo);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!initial.id) {
      // New item: stage the file and show a local preview
      setPendingFile(file);
      setPendingPreview(URL.createObjectURL(file));
      return;
    }
    const fd = new FormData();
    fd.append('icon', file);
    try {
      const url = await uploadItemIcon(initial.id, fd);
      set('image_url', url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const showWeapon = item.type === 'weapon';
  const showArmor  = item.type === 'armor';
  const showMaterial = item.type === 'material';
  const showConsumable = item.type === 'consumable';
  const showTool = item.type === 'tool';
  const showUltimate = item.type === 'special_attack';
  // Materials don't have a fixed tier — they span all tiers when is_tiered=true
  const showEquipTier = ['weapon','armor','tool','consumable'].includes(item.type);
  // Refined materials have a crafting recipe; weapon/armor use crafting skills, refined use refining skills
  const showRecipe = showWeapon || showArmor || showConsumable || (showMaterial && item.material_subtype === 'refined');
  const recipeSkillCategory = showMaterial ? 'refining' : 'crafting';

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">

        {/* ── LEFT: Identity panel ──────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Identity</p>

          {/* Icon + upload */}
          <div className="flex items-center gap-3">
            {(pendingPreview ?? item.image_url)
              ? <img src={pendingPreview ?? item.image_url!} alt="" className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />
              : <div className="w-14 h-14 rounded-lg bg-background border border-border flex items-center justify-center text-2xl shrink-0">?</div>
            }
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {isNew ? 'Icon (optional)' : 'Upload Icon'}
              </p>
              <input type="file" accept="image/*" onChange={handleIconUpload}
                className="text-xs text-body file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-background file:text-body hover:file:bg-accent" />
              {isNew && pendingFile && (
                <p className="mt-1 text-[11px] text-muted-foreground">Will upload on save</p>
              )}
            </div>
          </div>

          <Field label="Display name">
            <Input
              value={item.display_name}
              onChange={e => {
                const display = e.target.value;
                const slug = display.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                setItem(prev => ({ ...prev, display_name: display, name: slug }));
              }}
              placeholder="Iron Sword"
            />
            {item.name && (
              <p className="mt-1 text-[11px] text-muted-foreground">slug: <span className="font-mono">{item.name}</span></p>
            )}
          </Field>

          <Field label="Type">
            <Select value={item.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{TYPES_LABELS[t] ?? t}</option>)}
            </Select>
          </Field>

          <Field label="Description">
            <textarea
              value={item.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </Field>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="stackable" checked={item.stackable}
              onChange={e => set('stackable', e.target.checked)} className="w-4 h-4 rounded border-border" />
            <label htmlFor="stackable" className="text-sm text-body">Stackable</label>
            <span className="text-xs text-muted-foreground">(materials, consumables)</span>
          </div>

          {(showEquipTier || showMaterial) && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_tiered" checked={item.is_tiered}
                onChange={e => set('is_tiered', e.target.checked)}
                className="w-4 h-4 rounded border-border" />
              <label htmlFor="is_tiered" className="text-sm text-body">Tiered item</label>
            </div>
          )}

          {/* Tier scaling preview — shown when item is tiered and has at least one stat checked */}
          {item.is_tiered && item.tiered_stats.length > 0 && <TierScalingPreview
            itemType={item.type}
            tieredStats={item.tiered_stats}
            baseDamage={item.base_damage}
            baseDefense={item.base_defense}
            baseSpeed={item.attack_speed}
            yieldMin={(item.tool_config as Record<string, number>)?.yield_min ?? null}
            yieldMax={(item.tool_config as Record<string, number>)?.yield_max ?? null}
            tierScaling={tierScaling}
            maxTier={maxTier}
          />}

          {/* Save / Delete live inside the identity card */}
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? 'Saving…' : isNew ? 'Create Item' : 'Save Changes'}
            </button>
            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT: Stats + Recipe panels ─────────────────────────────── */}
        <div className="space-y-5">

          {/* ── Weapon stats ──────────────────────────────────────────────── */}
          {showWeapon && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Weapon Stats</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    {item.is_tiered && (
                      <input type="checkbox" checked={item.tiered_stats.includes('base_damage')} onChange={() => toggleTieredStat('base_damage')} className="w-3.5 h-3.5 rounded border-border shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Base Damage</span>
                  </label>
                  <Input type="number" step="0.01" value={item.base_damage ?? ''} onChange={e => set('base_damage', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    {item.is_tiered && (
                      <input type="checkbox" checked={item.tiered_stats.includes('attack_speed')} onChange={() => toggleTieredStat('attack_speed')} className="w-3.5 h-3.5 rounded border-border shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attack Speed (hits/sec)</span>
                  </label>
                  <Input type="number" step="0.05" min="0.1" value={item.attack_speed ?? 1}
                    onChange={e => set('attack_speed', e.target.value ? Number(e.target.value) : 1)} />
                </div>
                <Field label="Damage Type">
                  <Select value={item.primary_damage_type ?? ''} onChange={e => set('primary_damage_type', e.target.value || null)}>
                    <option value="">None</option>
                    {DAMAGE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
                <Field label="Weapon Type">
                  <Select value={item.weapon_type_id ?? ''} onChange={e => set('weapon_type_id', e.target.value || null)}>
                    <option value="">None</option>
                    {weaponTypes.map(wt => (
                      <option key={wt.id} value={wt.id}>{wt.display_name}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/* DPS preview */}
              {(item.base_damage ?? 0) > 0 && (
                <div className="rounded-md bg-background border border-border p-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">DPS Preview (base, before scaling)</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{item.base_damage} dmg</span>
                    <span className="text-muted-foreground">&times;</span>
                    <span className="text-muted-foreground">{item.attack_speed ?? 1} hits/s</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="font-semibold text-body">{((item.base_damage ?? 0) * (item.attack_speed ?? 1)).toFixed(1)} DPS</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Attack interval: {(1 / (item.attack_speed ?? 1)).toFixed(2)}s &middot;
                    Speed reference: 0.5=very slow &middot; 0.75=slow &middot; 1.0=normal &middot; 1.5=fast &middot; 2.0=very fast
                  </p>
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Attribute Scaling</p>
                  <p className="text-xs text-muted-foreground mt-0.5">The scaling multiplier uses the item's drop grade — S=1.5× A=1.4× B=1.3× C=1.2× D=1.1× F=1.0×</p>
                </div>
                <Field label="Attribute">
                  <Select value={item.primary_scaling_attr ?? ''} onChange={e => set('primary_scaling_attr', e.target.value || null)}>
                    <option value="">None</option>
                    {SCALE_ATTRS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                  </Select>
                </Field>
                <p className="text-xs text-muted-foreground italic">
                  Secondary scaling is configured per Ultimate, not on the weapon.
                </p>
              </div>
            </div>
          )}

          {/* ── Armor stats ───────────────────────────────────────────────── */}
          {showArmor && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Armor Stats</p>

              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  {item.is_tiered && (
                    <input type="checkbox" checked={item.tiered_stats.includes('base_defense')} onChange={() => toggleTieredStat('base_defense')} className="w-3.5 h-3.5 rounded border-border shrink-0" />
                  )}
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Base Defense</span>
                </label>
                <Input type="number" step="0.01" value={item.base_defense ?? ''} onChange={e => set('base_defense', e.target.value ? Number(e.target.value) : null)} />
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Damage Resistances</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Positive = resist · Negative = weakness · &ldquo;true&rdquo; damage bypasses all
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-2">
                  {RESIST_TYPES.map(rt => {
                    const entry = resistances[rt.key];
                    const val = entry?.value ?? 0;
                    const valueColor = val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-muted-foreground';
                    return (
                      <div key={rt.key} className="flex items-center gap-2">
                        <span className="text-sm text-body w-24 shrink-0">{rt.emoji} {rt.label}</span>
                        <input
                          type="number"
                          value={val}
                          onChange={e => setResist(rt.key, 'value', Number(e.target.value))}
                          className={`w-14 px-2 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-center ${valueColor}`}
                        />
                        <Select
                          value={entry?.mode ?? 'percent'}
                          onChange={e => setResist(rt.key, 'mode', e.target.value as ResistanceMode)}
                        >
                          <option value="percent">%</option>
                          <option value="flat">flat</option>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Material stats ────────────────────────────────────────────── */}
          {showMaterial && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Material</p>

              <Field label="Subtype">
                <div className="flex gap-2">
                  {(['raw','refined','unique'] as const).map(sub => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => set('material_subtype', sub)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors capitalize
                        ${item.material_subtype === sub
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:text-body hover:border-ring'}`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </Field>

              {item.material_subtype === 'raw' && (
                <div className="space-y-3">
                  <Field label="Gathering Skill">
                    <Select
                      value={item.gathering_skill_id ?? ''}
                      onChange={e => set('gathering_skill_id', e.target.value || null)}
                    >
                      <option value="">None assigned</option>
                      {skills.filter(s => s.category === 'gathering').map(s => (
                        <option key={s.id} value={s.id}>{s.display_name}</option>
                      ))}
                    </Select>
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Links this material to a gathering skill. Used to populate node drop tables.
                  </p>
                </div>
              )}

              {item.material_subtype === 'refined' && (
                <p className="text-xs text-muted-foreground">
                  Define the refining recipe in the section below. Use a <strong>Refining</strong> skill (Smelting, Tanning, etc.) as the required skill.
                </p>
              )}

              {item.material_subtype === 'unique' && (
                <p className="text-xs text-muted-foreground">
                  Unique materials are obtained via boss drops, events, or special quests — not crafted or gathered normally.
                </p>
              )}

              {!item.material_subtype && (
                <p className="text-xs text-muted-foreground italic">Select a subtype above to continue.</p>
              )}
            </div>
          )}

          {/* ── Crafting / Refining Recipe ─────────────────────────────── */}
          {showRecipe && (() => {
            const isCraftable = Object.values(tierRecipes).some(r => r !== null);
            const tierList = item.is_tiered
              ? Array.from({ length: maxTier }, (_, i) => i + 1)
              : [0];
            const tiny = 'w-full px-2 py-1 text-xs bg-background border border-border rounded text-body focus:outline-none focus:ring-1 focus:ring-ring';

            return (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {showMaterial ? 'Refining Recipe' : 'Crafting Recipe'}
                </p>
                {isCraftable && (
                  <button type="button" onClick={() => setTierRecipes({})}
                    className="text-xs text-destructive hover:underline transition-colors">
                    × Remove all
                  </button>
                )}
              </div>

              {/* Not yet craftable */}
              {!isCraftable && (
                <button type="button" onClick={makeAllCraftable}
                  className="w-full py-3 rounded-lg border-2 border-dashed border-primary/40 text-sm font-semibold text-primary hover:bg-primary/10 hover:border-primary transition-colors">
                  + Make Craftable
                  {item.is_tiered && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(creates recipes for all {maxTier} tiers)</span>
                  )}
                </button>
              )}

              {/* Recipe scroll item banner */}
              {isCraftable && item.type !== 'recipe' && (
                <div className="rounded-md bg-background border border-border px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipe Scroll Item</p>
                  {existingRecipeItem ? (
                    <p className="text-sm text-body">
                      <span className="text-muted-foreground">Auto-created: </span>
                      <a href={`/admin/items/${existingRecipeItem.id}`} className="text-primary hover:underline">
                        {existingRecipeItem.display_name}
                      </a>
                      <span className="text-muted-foreground text-xs ml-2">(click to edit icon, rarity, etc.)</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Will be created as <span className="font-medium text-body">&quot;{item.display_name} {recipeSuffix}&quot;</span> when you save.
                    </p>
                  )}
                </div>
              )}

              {/* All tier sections shown at once — like the loot table */}
              {isCraftable && tierList.map(t => {
                const tr = tierRecipes[t] ?? null;

                const setField = <K extends keyof RecipeFormData>(key: K, value: RecipeFormData[K]) =>
                  setTierRecipes(prev => ({ ...prev, [t]: { ...(prev[t] ?? blankRecipe(t)), [key]: value } }));

                const addIng = () => setTierRecipes(prev => {
                  const cur = prev[t]; if (!cur) return prev;
                  return { ...prev, [t]: { ...cur, ingredients: [...cur.ingredients, { item_id: '', tier: null, quantity: 1 }] } };
                });

                const removeIng = (i: number) => setTierRecipes(prev => {
                  const cur = prev[t]; if (!cur) return prev;
                  return { ...prev, [t]: { ...cur, ingredients: cur.ingredients.filter((_, idx) => idx !== i) } };
                });

                const setIng = (i: number, patch: Partial<RecipeIngredient>) => setTierRecipes(prev => {
                  const cur = prev[t]; if (!cur) return prev;
                  const next = [...cur.ingredients]; next[i] = { ...next[i], ...patch };
                  return { ...prev, [t]: { ...cur, ingredients: next } };
                });

                const fillDown = (mode: 'duplicate' | 'match' | 'increase') => {
                  if (!tr) return;
                  setTierRecipes(prev => {
                    const next = { ...prev };
                    for (let dt = t + 1; dt <= maxTier; dt++) {
                      const delta = dt - t;
                      next[dt] = {
                        ...(prev[dt] ?? blankRecipe(dt)),
                        id: prev[dt]?.id,
                        output_tier: dt,
                        ingredients: tr.ingredients.map(ing => ({
                          ...ing,
                          tier: ing.tier == null ? null
                            : mode === 'duplicate' ? ing.tier
                            : mode === 'match'     ? dt
                            : Math.min(ing.tier + delta, maxTier),
                        })),
                      };
                    }
                    return next;
                  });
                };

                return (
                  <div key={t} className="rounded-lg border border-border overflow-hidden">
                    {/* Tier header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-accent/20 border-b border-border">
                      <div className="flex items-center gap-2">
                        {item.is_tiered && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">T{t}</span>
                        )}
                        <span className="text-sm font-semibold text-heading">
                          {item.is_tiered ? `Tier ${t}` : 'Recipe'}
                        </span>
                        {tr && (
                          <span className="text-xs text-muted-foreground">
                            ({tr.ingredients.length} ingredient{tr.ingredients.length !== 1 ? 's' : ''})
                          </span>
                        )}
                      </div>
                      <button type="button"
                        onClick={() => setTierRecipes(prev =>
                          prev[t] ? { ...prev, [t]: null } : { ...prev, [t]: blankRecipe(t) }
                        )}
                        className={`text-xs transition-colors ${
                          tr ? 'text-destructive hover:underline' : 'text-primary hover:underline'
                        }`}>
                        {tr ? 'Remove' : '+ Add'}
                      </button>
                    </div>

                    {tr ? (
                      <div className="p-4 space-y-3">
                        {/* Output qty + optional refining skill on one row */}
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Output Qty</span>
                            <input type="number" min={1} value={tr.output_quantity}
                              onChange={e => setField('output_quantity', Number(e.target.value))}
                              className="w-16 px-2 py-1.5 text-sm bg-background border border-border rounded-md text-body text-center focus:outline-none focus:ring-1 focus:ring-ring" />
                          </div>
                          {showMaterial && (
                            <div className="flex items-center gap-2 flex-1 min-w-40">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Refining Skill</span>
                              <select value={tr.required_skill_id}
                                onChange={e => setField('required_skill_id', e.target.value)}
                                className="flex-1 px-2 py-1.5 text-sm bg-background border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring">
                                <option value="">Select skill…</option>
                                {skills.filter(s => s.category === recipeSkillCategory).map(s => (
                                  <option key={s.id} value={s.id}>{s.display_name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Ingredients table */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ingredients</p>
                            <button type="button" onClick={addIng}
                              className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-body hover:border-ring transition-colors">+ Add</button>
                          </div>

                          {tr.ingredients.length === 0
                            ? <p className="text-xs text-muted-foreground italic">No ingredients yet.</p>
                            : (
                              <div className="overflow-x-auto rounded-md border border-border/60">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border/50 bg-accent/20">
                                      <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Material</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground w-20">Tier</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground w-16">Qty</th>
                                      <th className="px-2 py-1.5 w-8" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tr.ingredients.map((ing, i) => {
                                      const mat = materialItems.find(m => m.id === ing.item_id);
                                      const matIsTiered = mat?.is_tiered ?? false;
                                      return (
                                        <tr key={i} className="border-b border-border/30 last:border-0">
                                          <td className="px-3 py-1.5">
                                            <select value={ing.item_id}
                                              onChange={e => setIng(i, { item_id: e.target.value, tier: null })}
                                              className={tiny}>
                                              <option value="">Select material…</option>
                                              {materialItems.map(m => (
                                                <option key={m.id} value={m.id}>{m.display_name}</option>
                                              ))}
                                            </select>
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {matIsTiered ? (
                                              <select value={ing.tier ?? ''}
                                                onChange={e => setIng(i, { tier: e.target.value ? Number(e.target.value) : null })}
                                                className={tiny}>
                                                <option value="">—</option>
                                                {tierOptions.map(tv => (
                                                  <option key={tv} value={tv}>T{tv}</option>
                                                ))}
                                              </select>
                                            ) : (
                                              <span className="text-muted-foreground px-1">—</span>
                                            )}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            <input type="number" min={1} value={ing.quantity}
                                              onChange={e => setIng(i, { quantity: Number(e.target.value) })}
                                              className="w-14 px-2 py-1 text-xs bg-background border border-border rounded text-body focus:outline-none focus:ring-1 focus:ring-ring text-center" />
                                          </td>
                                          <td className="px-2 py-1.5 text-center">
                                            <button type="button" onClick={() => removeIng(i)}
                                              className="text-muted-foreground hover:text-destructive transition-colors text-base leading-none">×</button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )
                          }
                        </div>

                        {/* Fill-down buttons */}
                        {item.is_tiered && t < maxTier && tr.ingredients.length > 0 && (
                          <div className="pt-1 space-y-1.5">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Copy T{t} → T{t + 1}–T{maxTier}:
                            </p>
                            <div className="grid grid-cols-3 gap-1.5">
                              <button type="button" onClick={() => fillDown('duplicate')}
                                className="py-1.5 text-xs rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
                                📋 Duplicate
                                <span className="block text-[10px] leading-tight opacity-70">same ingredient tiers</span>
                              </button>
                              <button type="button" onClick={() => fillDown('match')}
                                className="py-1.5 text-xs rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
                                🎯 Match to tier
                                <span className="block text-[10px] leading-tight opacity-70">ingredients → T{'{n}'}</span>
                              </button>
                              <button type="button" onClick={() => fillDown('increase')}
                                className="py-1.5 text-xs rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
                                📈 Increase per tier
                                <span className="block text-[10px] leading-tight opacity-70">+1 tier each step</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-3">
                        <p className="text-xs text-muted-foreground italic">No recipe configured for {item.is_tiered ? `T${t}` : 'this item'}.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* ── Consumable Effects ─────────────────────────────────────── */}
          {showConsumable && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Consumable Effects</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Each row is one effect applied on use.</p>
                </div>
                <button
                  type="button"
                  onClick={addEffect}
                  className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:text-body hover:border-ring transition-colors"
                >
                  + Add Effect
                </button>
              </div>

              {effects.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No effects yet. Add one above.</p>
              )}

              <div className="space-y-3">
                {effects.map((eff, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-2 p-3 bg-background border border-border rounded-md">

                    {/* Trigger */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Trigger</span>
                      <Select
                        value={eff.trigger}
                        onChange={e => setEffect(i, { trigger: e.target.value as EffectTrigger })}
                      >
                        {EFFECT_TRIGGERS.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </Select>
                    </div>

                    {/* Target */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Target</span>
                      <Select
                        value={eff.target}
                        onChange={e => setEffect(i, { target: e.target.value })}
                      >
                        {EFFECT_TARGET_GROUPS.map(g => (
                          <optgroup key={g.group} label={g.group}>
                            {g.targets.map(t => (
                              <option key={t.key} value={t.key}>{t.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </div>

                    {/* Value */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Value</span>
                      <Input
                        type="number"
                        value={eff.value}
                        onChange={e => setEffect(i, { value: Number(e.target.value) })}
                        className="w-20"
                      />
                    </div>

                    {/* Buff: duration in seconds */}
                    {eff.trigger === 'buff' && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Duration (seconds)</span>
                        <Input
                          type="number" min={1}
                          value={eff.duration_seconds ?? ''}
                          onChange={e => setEffect(i, { duration_seconds: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="e.g. 300"
                          className="w-28"
                        />
                      </div>
                    )}

                    {/* On-hit: count */}
                    {eff.trigger === 'on_hit' && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hit count</span>
                        <Input
                          type="number" min={1}
                          value={eff.hit_count ?? ''}
                          onChange={e => setEffect(i, { hit_count: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="e.g. 5"
                          className="w-24"
                        />
                      </div>
                    )}

                    {/* Hint + remove */}
                    <div className="flex flex-col justify-between ml-auto self-stretch min-w-0">
                      <button
                        type="button"
                        onClick={() => removeEffect(i)}
                        className="self-end p-1 text-muted-foreground hover:text-destructive transition-colors text-lg leading-none"
                      >×</button>
                      <span className="text-[10px] text-muted-foreground italic">
                        {EFFECT_TRIGGERS.find(t => t.value === eff.trigger)?.hint}
                      </span>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tool stats ─────────────────────────────────────────── */}
          {showTool && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tool Stats</p>

              {/* Equipment slot */}
              <Field label="Equipment Slot">
                <Select
                  value={item.tool_slot ?? ''}
                  onChange={e => set('tool_slot', e.target.value || null)}
                >
                  <option value="">Auto-detect from name</option>
                  <option value="tool_pickaxe">Pickaxe</option>
                  <option value="tool_axe">Axe</option>
                  <option value="tool_hammer">Hammer</option>
                  <option value="tool_sickle">Sickle / Scythe</option>
                  <option value="tool_knife">Knife</option>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Set this explicitly so tools with custom names equip to the right slot.</p>
              </Field>

              {/* Gathering skill */}
              <Field label="Gathering Skill">
                <Select
                  value={item.gathering_skill_id ?? ''}
                  onChange={e => set('gathering_skill_id', e.target.value || null)}
                >
                  <option value="">None assigned</option>
                  {skills.filter(s => s.category === 'gathering').map(s => (
                    <option key={s.id} value={s.id}>{s.display_name}</option>
                  ))}
                </Select>
              </Field>

              {/* Base yield range */}
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Base Yield (own tier)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Items gathered per attempt at the tool&apos;s own tier.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      {item.is_tiered && (
                        <input type="checkbox" checked={item.tiered_stats.includes('yield_min')} onChange={() => toggleTieredStat('yield_min')} className="w-3.5 h-3.5 rounded border-border shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Min</span>
                    </label>
                    <Input type="number" min={1}
                      value={toolConfig.yield_min}
                      onChange={e => setTool('yield_min', Number(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      {item.is_tiered && (
                        <input type="checkbox" checked={item.tiered_stats.includes('yield_max')} onChange={() => toggleTieredStat('yield_max')} className="w-3.5 h-3.5 rounded border-border shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Max</span>
                    </label>
                    <Input type="number" min={1}
                      value={toolConfig.yield_max}
                      onChange={e => setTool('yield_max', Number(e.target.value))} />
                  </div>
                </div>
              </div>

              {/* Tier modifiers */}
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tier Modifiers</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    100% = 1 guaranteed item change &middot; 25% = 25% chance of an extra change
                  </p>
                </div>
                <Field label="Above penalty (% reduction, 1 tier above)">
                  <Input type="number" min={0} step={5}
                    value={toolConfig.above_penalty}
                    onChange={e => setTool('above_penalty', Number(e.target.value))} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Below bonus base (1 tier below, %)">
                    <Input type="number" min={0} step={5}
                      value={toolConfig.below_bonus_base}
                      onChange={e => setTool('below_bonus_base', Number(e.target.value))} />
                  </Field>
                  <Field label="Below compound growth (% per step)">
                    <Input type="number" min={0} step={5}
                      value={toolConfig.below_bonus_growth}
                      onChange={e => setTool('below_bonus_growth', Number(e.target.value))} />
                  </Field>
                </div>

                {/* Live preview */}
                {item.equipment_tier && item.equipment_tier > 1 && (
                  <div className="rounded-md bg-background border border-border p-3 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Preview (T{item.equipment_tier} tool)</p>
                    {/* One tier above */}
                    {item.equipment_tier < maxTier && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">T{item.equipment_tier + 1} (above)</span>
                        <span className="text-destructive">&minus;{toolConfig.above_penalty.toFixed(0)}%</span>
                      </div>
                    )}
                    {/* Own tier */}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">T{item.equipment_tier} (own)</span>
                      <span className="text-body">{toolConfig.yield_min}&ndash;{toolConfig.yield_max} items</span>
                    </div>
                    {/* Tiers below */}
                    {Array.from({ length: item.equipment_tier - 1 }, (_, i) => i + 1).map(step => {
                      const tier = item.equipment_tier! - step;
                      const bonus = belowBonusAtStep(step);
                      return (
                        <div key={tier} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">T{tier} (below ×{step})</span>
                          <span className="text-green-400">+{bonus.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Ultimate stats ──────────────────────────────────────── */}
          {showUltimate && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ultimate Stats</p>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Damage Type">
                  <Select value={item.primary_damage_type ?? ''} onChange={e => set('primary_damage_type', e.target.value || null)}>
                    <option value="">None</option>
                    {DAMAGE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Attribute Scaling</p>
                  <p className="text-xs text-muted-foreground mt-0.5">The scaling multiplier uses the item's drop grade — S=1.5× A=1.4× B=1.3× C=1.2× D=1.1× F=1.0×</p>
                </div>
                <Field label="Attribute">
                  <Select value={item.primary_scaling_attr ?? ''} onChange={e => set('primary_scaling_attr', e.target.value || null)}>
                    <option value="">None</option>
                    {SCALE_ATTRS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                  </Select>
                </Field>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Compatible Weapon Types</p>
                  <p className="text-xs text-muted-foreground mt-0.5">This Ultimate can only be bound to weapons of these types.</p>
                </div>
                {weaponTypes.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No weapon types defined yet. <a href="/admin/weapon-types" className="underline hover:text-body">Add some here.</a></p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {weaponTypes.map(wt => {
                    const checked = item.compatible_weapon_type_ids.includes(wt.id);
                    return (
                      <label key={wt.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...item.compatible_weapon_type_ids, wt.id]
                              : item.compatible_weapon_type_ids.filter(id => id !== wt.id);
                            set('compatible_weapon_type_ids', next);
                          }}
                          className="w-4 h-4 rounded border-border"
                        />
                        <span className="text-sm text-body">{wt.display_name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Drop grade weights override (weapon / armor / tool) ──────── */}
          {(showWeapon || showArmor || showTool) && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Drop Grade Weights Override</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Controls how likely each quality grade is when this item drops from an enemy.
                  Leave all blank to use the global defaults configured in{' '}
                  <a href="/admin/grade-weights" className="text-primary hover:underline">Grade Weights</a>.
                  Higher weight = more common. S is best quality, F is worst.
                </p>
              </div>
              <div className="grid grid-cols-6 gap-3">
                {GRADES.map(g => (
                  <div key={g} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-muted-foreground text-center">{g}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      placeholder="—"
                      value={item.grade_weights?.[g as keyof NonNullable<Item['grade_weights']>] ?? ''}
                      onChange={e => setGradeWeight(g, e.target.value)}
                      className="px-2 py-1.5 text-sm bg-background border border-border rounded-md text-body text-center placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
              {item.grade_weights && (
                <button
                  type="button"
                  onClick={() => set('grade_weights', null)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear overrides (revert to global defaults)
                </button>
              )}
            </div>
          )}

          {/* Placeholder for non-equipment types */}
          {!showWeapon && !showArmor && !showMaterial && !showConsumable && !showTool && !showUltimate && (
            <div className="bg-card border border-border rounded-lg p-8 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No additional stats for this item type.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
