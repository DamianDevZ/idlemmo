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
  rarity: string;
  description: string;
  stackable: boolean;
  equipment_tier: number | null;
  base_damage: number | null;
  base_defense: number | null;
  primary_damage_type: string | null;
  material_type: string | null;
  primary_scaling_attr: string | null;
  primary_scaling_grade: string | null;
  secondary_scaling_attr: string | null;
  secondary_scaling_grade: string | null;
  image_url: string | null;
  resistances?: ResistancesMap;
  required_mastery_skill_id: string | null;
  required_mastery_level: number;
  material_subtype: string | null;
  gathering_skill_id: string | null;
  is_tiered: boolean;
  consumable_effects: ConsumableEffect[];
};

export type SkillOption = { id: string; name: string; display_name: string; category: string };
export type MaterialItem = { id: string; name: string; display_name: string; equipment_tier: number | null; is_tiered: boolean };

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPES = ['material','tool','weapon','armor','consumable','misc','special_attack'];
const RARITIES = ['common','uncommon','rare','epic','legendary'];
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

const MATERIAL_TYPES = ['metal','leather','cloth'];
const SCALE_ATTRS = ['str','dex','int'];
const GRADES = ['S','A','B','C','D','F'];


const BLANK_RECIPE: RecipeFormData = {
  display_name: '',
  output_quantity: 1,
  required_skill_id: '',
  required_skill_level: 1,
  ingredients: [],
  craft_time_seconds: 30,
};

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

export function ItemForm({
  initial,
  recipe: initialRecipe,
  skills,
  materialItems,
  maxTier,
}: {
  initial: Item;
  recipe?: RecipeFormData | null;
  skills: SkillOption[];
  materialItems: MaterialItem[];
  maxTier: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<Item>(initial);
  const [resistances, setResistances] = useState<ResistancesMap>(() => initResistances(initial.resistances));
  const [effects, setEffects] = useState<ConsumableEffect[]>(initial.consumable_effects ?? []);
  const [recipe, setRecipe] = useState<RecipeFormData | null>(initialRecipe ?? null);

  const isNew = !initial.id;

  // Linear interpolation: T1 = level 1, T_maxTier = level 70
  function tierToLevel(tier: number): number {
    if (maxTier <= 1) return 1;
    return Math.max(1, Math.round(1 + (tier - 1) * 69 / (maxTier - 1)));
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

  function setRecipeField<K extends keyof RecipeFormData>(key: K, value: RecipeFormData[K]) {
    setRecipe(prev => (prev ? { ...prev, [key]: value } : { ...BLANK_RECIPE, [key]: value }));
  }

  function addIngredient() {
    setRecipe(prev => prev ? {
      ...prev,
      ingredients: [...prev.ingredients, { item_id: '', tier: null, quantity: 1 }],
    } : null);
  }

  function removeIngredient(i: number) {
    setRecipe(prev => prev ? {
      ...prev,
      ingredients: prev.ingredients.filter((_, idx) => idx !== i),
    } : null);
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

  function setIngredient(i: number, patch: Partial<RecipeIngredient>) {
    setRecipe(prev => {
      if (!prev) return prev;
      const next = [...prev.ingredients];
      next[i] = { ...next[i], ...patch };
      return { ...prev, ingredients: next };
    });
  }

  function handleTierChange(tier: number | null) {
    set('equipment_tier', tier);
    if (tier) {
      const lvl = tierToLevel(tier);
      set('required_mastery_level', lvl);
      setRecipe(prev => prev ? { ...prev, required_skill_level: lvl } : prev);
    }
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertItem(initial.id ?? null, { ...item, resistances, consumable_effects: effects }, recipe);
        router.push('/admin/items');
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
        await deleteItem(initial.id!);
        router.push('/admin/items');
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!initial.id || !e.target.files?.[0]) return;
    const fd = new FormData();
    fd.append('icon', e.target.files[0]);
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
  // Materials don't have a fixed tier — they span all tiers when is_tiered=true
  const showEquipTier = ['weapon','armor','tool','consumable'].includes(item.type);
  // Refined materials have a crafting recipe; weapon/armor use crafting skills, refined use refining skills
  const showRecipe = showWeapon || showArmor || showConsumable || (showMaterial && item.material_subtype === 'refined');
  const recipeSkillCategory = showMaterial ? 'refining' : 'crafting';

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5 items-start">

        {/* ── LEFT: Identity panel ──────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Identity</p>

          {/* Icon + upload */}
          <div className="flex items-center gap-3">
            {item.image_url
              ? <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />
              : <div className="w-14 h-14 rounded-lg bg-background border border-border flex items-center justify-center text-2xl shrink-0">?</div>
            }
            <div className="min-w-0">
              {!isNew ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Upload Icon</p>
                  <input type="file" accept="image/*" onChange={handleIconUpload}
                    className="text-xs text-body file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-background file:text-body hover:file:bg-accent" />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Save first, then upload an icon.</p>
              )}
            </div>
          </div>

          <Field label="Internal slug">
            <Input value={item.name} onChange={e => set('name', e.target.value)} placeholder="iron_sword" />
          </Field>
          <Field label="Display name">
            <Input value={item.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Iron Sword" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={item.type} onChange={e => set('type', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Rarity">
              <Select value={item.rarity} onChange={e => set('rarity', e.target.value)}>
                {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
          </div>

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
                onChange={e => {
                  set('is_tiered', e.target.checked);
                  if (!e.target.checked) set('equipment_tier', null);
                  else if (showEquipTier) handleTierChange(1);
                }}
                className="w-4 h-4 rounded border-border" />
              <label htmlFor="is_tiered" className="text-sm text-body">Tiered item</label>
            </div>
          )}

          {showEquipTier && item.is_tiered && (
            <Field label="Equipment Tier">
              <Select
                value={item.equipment_tier?.toString() ?? ''}
                onChange={e => handleTierChange(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select tier…</option>
                {tierOptions.map(t => (
                  <option key={t} value={t}>Tier {t} (Level {tierToLevel(t)}+)</option>
                ))}
              </Select>
            </Field>
          )}

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
                <Field label="Base Damage">
                  <Input type="number" step="0.01" value={item.base_damage ?? ''} onChange={e => set('base_damage', e.target.value ? Number(e.target.value) : null)} />
                </Field>
                <Field label="Damage Type">
                  <Select value={item.primary_damage_type ?? ''} onChange={e => set('primary_damage_type', e.target.value || null)}>
                    <option value="">None</option>
                    {DAMAGE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
                <Field label="Material">
                  <Select value={item.material_type ?? ''} onChange={e => set('material_type', e.target.value || null)}>
                    <option value="">None</option>
                    {MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Attribute Scaling</p>
                  <p className="text-xs text-muted-foreground mt-0.5">S=1.5× A=1.4× B=1.3× C=1.2× D=1.1× F=1.0×</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Attribute">
                    <Select value={item.primary_scaling_attr ?? ''} onChange={e => set('primary_scaling_attr', e.target.value || null)}>
                      <option value="">None</option>
                      {SCALE_ATTRS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                    </Select>
                  </Field>
                  <Field label="Grade">
                    <Select value={item.primary_scaling_grade ?? ''} onChange={e => set('primary_scaling_grade', e.target.value || null)}>
                      <option value="">None</option>
                      {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </Select>
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Secondary scaling is configured per special attack, not on the weapon.
                </p>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Mastery Requirement</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Usage skill needed to equip. Level auto-set by tier ({tierOptions.map(t => `T${t}=L${tierToLevel(t)}`).join(' · ')}).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Usage Skill">
                    <Select value={item.required_mastery_skill_id ?? ''} onChange={e => set('required_mastery_skill_id', e.target.value || null)}>
                      <option value="">None required</option>
                      {skills.filter(s => s.category === 'usage').map(s => (
                        <option key={s.id} value={s.id}>{s.display_name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Min Level">
                    <Input type="number" min={1} max={99}
                      value={item.required_mastery_level}
                      onChange={e => set('required_mastery_level', Number(e.target.value))} />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* ── Armor stats ───────────────────────────────────────────────── */}
          {showArmor && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Armor Stats</p>

              <Field label="Base Defense">
                <Input type="number" step="0.01" value={item.base_defense ?? ''} onChange={e => set('base_defense', e.target.value ? Number(e.target.value) : null)} />
              </Field>

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

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Mastery Requirement</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Usage skill needed to equip. Level auto-set by tier ({tierOptions.map(t => `T${t}=L${tierToLevel(t)}`).join(' · ')}).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Usage Skill">
                    <Select value={item.required_mastery_skill_id ?? ''} onChange={e => set('required_mastery_skill_id', e.target.value || null)}>
                      <option value="">None required</option>
                      {skills.filter(s => s.category === 'usage').map(s => (
                        <option key={s.id} value={s.id}>{s.display_name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Min Level">
                    <Input type="number" min={1} max={99}
                      value={item.required_mastery_level}
                      onChange={e => set('required_mastery_level', Number(e.target.value))} />
                  </Field>
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

          {/* ── Crafting Recipe ───────────────────────────────────────────── */}
          {showRecipe && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {showMaterial ? 'Refining Recipe' : 'Crafting Recipe'}
                </p>
                <button
                  type="button"
                  onClick={() => setRecipe(r => r ? null : { ...BLANK_RECIPE, display_name: item.display_name })}
                  className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:text-body hover:border-ring transition-colors"
                >
                  {recipe ? 'Remove Recipe' : '+ Add Recipe'}
                </button>
              </div>

              {recipe && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Recipe Name">
                      <Input value={recipe.display_name}
                        onChange={e => setRecipeField('display_name', e.target.value)}
                        placeholder="Craft Iron Sword" />
                    </Field>
                    <Field label="Output Qty">
                      <Input type="number" min={1}
                        value={recipe.output_quantity}
                        onChange={e => setRecipeField('output_quantity', Number(e.target.value))} />
                    </Field>
                    <Field label="Required Skill">
                      <Select value={recipe.required_skill_id}
                        onChange={e => setRecipeField('required_skill_id', e.target.value)}>
                        <option value="">Select skill…</option>
                        {skills.filter(s => s.category === recipeSkillCategory).map(s => (
                          <option key={s.id} value={s.id}>{s.display_name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Skill Level">
                      <Input type="number" min={1} max={99}
                        value={recipe.required_skill_level}
                        onChange={e => setRecipeField('required_skill_level', Number(e.target.value))} />
                    </Field>
                    <Field label="Craft Time (s)">
                      <Input type="number" min={1}
                        value={recipe.craft_time_seconds}
                        onChange={e => setRecipeField('craft_time_seconds', Number(e.target.value))} />
                    </Field>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ingredients</p>
                      <button type="button" onClick={addIngredient}
                        className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-body hover:border-ring transition-colors">
                        + Add
                      </button>
                    </div>
                    {recipe.ingredients.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No ingredients yet.</p>
                    )}
                    {recipe.ingredients.map((ing, i) => {
                      const mat = materialItems.find(m => m.id === ing.item_id);
                      const matIsTiered = mat?.is_tiered ?? false;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <Select
                            value={ing.item_id}
                            onChange={e => setIngredient(i, { item_id: e.target.value, tier: null })}
                            className="flex-1"
                          >
                            <option value="">Select material…</option>
                            {materialItems.map(m => (
                              <option key={m.id} value={m.id}>{m.display_name}</option>
                            ))}
                          </Select>
                          {matIsTiered && (
                            <Select
                              value={ing.tier ?? ''}
                              onChange={e => setIngredient(i, { tier: e.target.value ? Number(e.target.value) : null })}
                              className="w-20"
                            >
                              <option value="">Tier</option>
                              {tierOptions.map(t => (
                                <option key={t} value={t}>T{t}</option>
                              ))}
                            </Select>
                          )}
                          <input type="number" min={1} value={ing.quantity}
                            onChange={e => setIngredient(i, { quantity: Number(e.target.value) })}
                            className="w-16 px-2 py-2 text-sm bg-background border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring text-center" />
                          <button type="button" onClick={() => removeIngredient(i)}
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors text-lg leading-none">×</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Placeholder for non-equipment types */}
          {!showWeapon && !showArmor && !showMaterial && !showConsumable && (
            <div className="bg-card border border-border rounded-lg p-8 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No additional stats for this item type.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
