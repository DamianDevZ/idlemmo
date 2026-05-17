'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertItem, uploadItemIcon, deleteItem } from '@/features/admin/item-actions';
import type { RecipeFormData } from '@/features/admin/item-actions';

// ── Types ──────────────────────────────────────────────────────────────────────

type ResistanceMode = 'percent' | 'flat';
type ResistanceEntry = { value: number; mode: ResistanceMode };
type ResistancesMap = Record<string, ResistanceEntry>;

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
};

export type SkillOption = { id: string; name: string; display_name: string };

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPES = ['material','tool','weapon','armor','consumable','misc','special_attack'];
const RARITIES = ['common','uncommon','rare','epic','legendary'];
const DAMAGE_TYPES = ['slash','blunt','bleed','pierce','fire','ice','lightning','poison','true'];
// Resistance grid excludes 'true' — true damage bypasses all armor
const RESIST_TYPES: { key: string; label: string; emoji: string }[] = [
  { key: 'slash',     label: 'Slash',     emoji: '⚔️' },
  { key: 'blunt',     label: 'Blunt',     emoji: '🔨' },
  { key: 'pierce',    label: 'Pierce',    emoji: '🏹' },
  { key: 'bleed',     label: 'Bleed',     emoji: '🩸' },
  { key: 'fire',      label: 'Fire',      emoji: '🔥' },
  { key: 'ice',       label: 'Ice',       emoji: '❄️' },
  { key: 'lightning', label: 'Lightning', emoji: '⚡' },
  { key: 'poison',    label: 'Poison',    emoji: '☠️' },
];
const MATERIAL_TYPES = ['metal','leather','cloth'];
const SCALE_ATTRS = ['str','dex','int'];
const GRADES = ['S','A','B','C','D','F'];

const BLANK_RECIPE: RecipeFormData = {
  display_name: '',
  output_quantity: 1,
  required_skill_id: '',
  required_skill_level: 1,
  ingredients: [],
  base_success_chance: 80,
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
}: {
  initial: Item;
  recipe?: RecipeFormData | null;
  skills: SkillOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<Item>(initial);
  const [resistances, setResistances] = useState<ResistancesMap>(() => initResistances(initial.resistances));
  const [recipe, setRecipe] = useState<RecipeFormData | null>(initialRecipe ?? null);

  const isNew = !initial.id;

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
      ingredients: [...prev.ingredients, { item_name: '', quantity: 1 }],
    } : null);
  }

  function removeIngredient(i: number) {
    setRecipe(prev => prev ? {
      ...prev,
      ingredients: prev.ingredients.filter((_, idx) => idx !== i),
    } : null);
  }

  function setIngredient(i: number, field: 'item_name' | 'quantity', value: string | number) {
    setRecipe(prev => {
      if (!prev) return prev;
      const next = [...prev.ingredients];
      next[i] = { ...next[i], [field]: value };
      return { ...prev, ingredients: next };
    });
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertItem(initial.id ?? null, { ...item, resistances }, recipe);
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
  const showArmor = item.type === 'armor';
  const showEquipTier = ['weapon','armor','tool'].includes(item.type);
  const showRecipe = showWeapon || showArmor;

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

          {showEquipTier && (
            <Field label="Equipment Tier (1–5)">
              <Input type="number" min={1} max={5}
                value={item.equipment_tier ?? ''}
                onChange={e => set('equipment_tier', e.target.value ? Number(e.target.value) : null)} />
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
            </div>
          )}

          {/* ── Armor stats ───────────────────────────────────────────────── */}
          {showArmor && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Armor Stats</p>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Base Defense">
                  <Input type="number" step="0.01" value={item.base_defense ?? ''} onChange={e => set('base_defense', e.target.value ? Number(e.target.value) : null)} />
                </Field>
                <Field label="Material Type">
                  <Select value={item.material_type ?? ''} onChange={e => set('material_type', e.target.value || null)}>
                    <option value="">None</option>
                    {MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
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

          {/* ── Crafting Recipe ───────────────────────────────────────────── */}
          {showRecipe && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Crafting Recipe</p>
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
                        {skills.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Skill Level">
                      <Input type="number" min={1} max={99}
                        value={recipe.required_skill_level}
                        onChange={e => setRecipeField('required_skill_level', Number(e.target.value))} />
                    </Field>
                    <Field label="Success Chance (%)">
                      <Input type="number" min={1} max={95}
                        value={recipe.base_success_chance}
                        onChange={e => setRecipeField('base_success_chance', Number(e.target.value))} />
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
                    {recipe.ingredients.map((ing, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input value={ing.item_name}
                          onChange={e => setIngredient(i, 'item_name', e.target.value)}
                          placeholder="item_slug" className="flex-1" />
                        <input type="number" min={1} value={ing.quantity}
                          onChange={e => setIngredient(i, 'quantity', Number(e.target.value))}
                          className="w-16 px-2 py-2 text-sm bg-background border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring text-center" />
                        <button type="button" onClick={() => removeIngredient(i)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors text-lg leading-none">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Placeholder for non-equipment types */}
          {!showWeapon && !showArmor && (
            <div className="bg-card border border-border rounded-lg p-8 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No additional stats for this item type.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
