'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertEnemy, deleteEnemy } from '@/features/admin/enemy-actions';

type Enemy = {
  id?: string;
  name: string;
  display_name: string;
  biome_id: string;
  tier: number;
  level: number;
  base_hp: number;
  base_attack: number;
  base_armor: number;
  base_speed: number;
  xp_reward: number;
  armor_preset_id: string;
  loot_table: object;
};

type Biome = { id: string; name: string };
type Preset = { id: string; display_name: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function Inp({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
  );
}

function Sel({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...props}
      className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring">
      {children}
    </select>
  );
}

export function EnemyForm({ initial, biomes, presets }: { initial: Enemy; biomes: Biome[]; presets: Preset[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enemy, setEnemy] = useState<Enemy>(initial);
  const [lootJson, setLootJson] = useState(JSON.stringify(initial.loot_table, null, 2));
  const [lootError, setLootError] = useState<string | null>(null);

  const isNew = !initial.id;

  function set<K extends keyof Enemy>(key: K, value: Enemy[K]) {
    setEnemy(prev => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    let parsedLoot: object;
    try {
      parsedLoot = JSON.parse(lootJson);
      setLootError(null);
    } catch {
      setLootError('Invalid JSON in loot table');
      return;
    }
    startTransition(async () => {
      try {
        await upsertEnemy(initial.id ?? null, { ...enemy, loot_table: parsedLoot });
        router.push('/admin/enemies');
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleDelete() {
    if (!initial.id) return;
    if (!confirm(`Delete "${enemy.display_name}"?`)) return;
    startTransition(async () => {
      try {
        await deleteEnemy(initial.id!);
        router.push('/admin/enemies');
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5 items-start">

        {/* ── LEFT: Identity ─────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Identity</p>

          <Field label="Internal name">
            <Inp value={enemy.name} onChange={e => set('name', e.target.value)} placeholder="rock_golem" />
          </Field>
          <Field label="Display name">
            <Inp value={enemy.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Rock Golem" />
          </Field>
          <Field label="Biome">
            <Sel value={enemy.biome_id} onChange={e => set('biome_id', e.target.value)}>
              <option value="">Select…</option>
              {biomes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Sel>
          </Field>
          <Field label="Armor Preset">
            <Sel value={enemy.armor_preset_id} onChange={e => set('armor_preset_id', e.target.value)}>
              {presets.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </Sel>
          </Field>

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <button onClick={handleSave} disabled={isPending}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {isPending ? 'Saving…' : isNew ? 'Create Enemy' : 'Save Changes'}
            </button>
            {!isNew && (
              <button onClick={handleDelete} disabled={isPending}
                className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50">
                Delete
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT: Stats + Loot ────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Combat stats */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Combat Stats</p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Tier"><Inp type="number" min={1} max={5} value={enemy.tier} onChange={e => set('tier', Number(e.target.value))} /></Field>
              <Field label="Level"><Inp type="number" min={1} value={enemy.level} onChange={e => set('level', Number(e.target.value))} /></Field>
              <Field label="XP Reward"><Inp type="number" min={0} value={enemy.xp_reward} onChange={e => set('xp_reward', Number(e.target.value))} /></Field>
              <Field label="Base HP"><Inp type="number" min={1} value={enemy.base_hp} onChange={e => set('base_hp', Number(e.target.value))} /></Field>
              <Field label="Base Attack"><Inp type="number" min={0} value={enemy.base_attack} onChange={e => set('base_attack', Number(e.target.value))} /></Field>
              <Field label="Base Armor"><Inp type="number" min={0} value={enemy.base_armor} onChange={e => set('base_armor', Number(e.target.value))} /></Field>
              <Field label="Speed Mult">
                <Inp type="number" step="0.1" min={0.1} max={3} value={enemy.base_speed} onChange={e => set('base_speed', Number(e.target.value))} />
              </Field>
            </div>
          </div>

          {/* Loot table */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Loot Table (JSON)</p>
            <p className="text-xs text-muted-foreground">Array of {`{ item, weight, min, max }`} objects. Higher weight = more frequent.</p>
            {lootError && <p className="text-xs text-destructive">{lootError}</p>}
            <textarea
              value={lootJson}
              onChange={e => setLootJson(e.target.value)}
              rows={10}
              className="w-full font-mono px-3 py-2 text-xs bg-background border border-border rounded-md text-body focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </div>

        </div>
      </div>
    </div>
  );
}
