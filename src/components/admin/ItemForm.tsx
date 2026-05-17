'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertItem, uploadItemIcon, deleteItem } from '@/features/admin/item-actions';

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
};

const TYPES = ['material','tool','weapon','armor','consumable','misc','special_attack'];
const RARITIES = ['common','uncommon','rare','epic','legendary'];
const DAMAGE_TYPES = ['slash','blunt','bleed','pierce','fire','ice','lightning','poison','true'];
const MATERIAL_TYPES = ['metal','leather','cloth'];
const SCALE_ATTRS = ['str','dex','int'];
const GRADES = ['S','A','B','C','D','F'];

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

export function ItemForm({ initial }: { initial: Item }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<Item>(initial);

  const isNew = !initial.id;

  function set<K extends keyof Item>(key: K, value: Item[K]) {
    setItem(prev => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertItem(initial.id ?? null, item);
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

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Icon */}
      <div className="flex items-center gap-4">
        {item.image_url
          ? <img src={item.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
          : <div className="w-16 h-16 rounded-lg bg-card border border-border flex items-center justify-center text-2xl">?</div>
        }
        {!isNew && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Upload Icon</label>
            <input type="file" accept="image/*" onChange={handleIconUpload}
              className="text-sm text-body file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-card file:text-body hover:file:bg-accent" />
          </div>
        )}
        {isNew && <p className="text-xs text-muted-foreground">Save item first, then upload an icon.</p>}
      </div>

      {/* Identity */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Internal name (slug)">
          <Input value={item.name} onChange={e => set('name', e.target.value)} placeholder="iron_sword" />
        </Field>
        <Field label="Display name">
          <Input value={item.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Iron Sword" />
        </Field>
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
          rows={2}
          className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </Field>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="stackable" checked={item.stackable} onChange={e => set('stackable', e.target.checked)}
          className="w-4 h-4 rounded border-border" />
        <label htmlFor="stackable" className="text-sm text-body">Stackable (materials, consumables)</label>
      </div>

      {/* Tier */}
      {showEquipTier && (
        <Field label="Equipment Tier (1–5)">
          <Input type="number" min={1} max={5} value={item.equipment_tier ?? ''} onChange={e => set('equipment_tier', e.target.value ? Number(e.target.value) : null)} />
        </Field>
      )}

      {/* Weapon-specific */}
      {showWeapon && (
        <div className="space-y-4 p-4 bg-card border border-border rounded-lg">
          <h3 className="text-sm font-semibold text-heading">Weapon Stats</h3>
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
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attribute Scaling</h4>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary Attribute">
              <Select value={item.primary_scaling_attr ?? ''} onChange={e => set('primary_scaling_attr', e.target.value || null)}>
                <option value="">None</option>
                {SCALE_ATTRS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
              </Select>
            </Field>
            <Field label="Primary Grade  (S=1.5×  A=1.4×  B=1.3×  C=1.2×  D=1.1×  F=1.0×)">
&
              <Select value={item.primary_scaling_grade ?? ''} onChange={e => set('primary_scaling_grade', e.target.value || null)}>
                <option value="">None</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
            <Field label="Secondary Attribute (T3+ only)">
              <Select value={item.secondary_scaling_attr ?? ''} onChange={e => set('secondary_scaling_attr', e.target.value || null)}>
                <option value="">None</option>
                {SCALE_ATTRS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
              </Select>
            </Field>
            <Field label="Secondary Grade">
              <Select value={item.secondary_scaling_grade ?? ''} onChange={e => set('secondary_scaling_grade', e.target.value || null)}>
                <option value="">None</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      )}

      {/* Armor-specific */}
      {showArmor && (
        <div className="space-y-4 p-4 bg-card border border-border rounded-lg">
          <h3 className="text-sm font-semibold text-heading">Armor Stats</h3>
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
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
  );
}
