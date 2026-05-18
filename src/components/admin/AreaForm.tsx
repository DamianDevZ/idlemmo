'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  upsertArea,
  deleteArea,
  addBiomeToArea,
  removeBiomeFromArea,
  upsertAreaBiomeLoot,
  deleteAreaBiomeLoot,
} from '@/features/admin/world-actions';

// ─── Types ────────────────────────────────────────────────────────────────────

type AreaData = {
  name: string;
  display_name: string;
  tier: number;
  description: string;
  icon: string;
  sort_order: number;
};

type LootRow = {
  id: string;
  item_id: string;
  weight: number;
  quantity_min: number;
  quantity_max: number;
  gather_time_ms: number;
  required_skill_name: string | null;
};

type AreaBiome = {
  id: string;
  biome_id: string;
  area_biome_loot: LootRow[];
};

type Biome = { id: string; name: string; display_name: string; icon: string };
type Item  = { id: string; display_name: string; type: string; name: string };

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  'px-3 py-2 text-sm bg-background border border-border rounded-md text-body ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const btnPrimary =
  'px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium ' +
  'hover:opacity-90 transition-opacity disabled:opacity-50';
const btnSecondary =
  'px-3 py-1.5 text-xs bg-accent text-accent-foreground rounded ' +
  'hover:opacity-90 transition-opacity disabled:opacity-50';
const btnDestructive =
  'px-3 py-1.5 text-xs text-destructive border border-destructive/30 rounded ' +
  'hover:bg-destructive/10 transition-colors disabled:opacity-50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

// ─── Inline add-loot form (shown as a table row) ─────────────────────────────

function AddLootRow({
  areaBiomeId,
  areaId,
  items,
  onDone,
}: {
  areaBiomeId: string;
  areaId: string;
  items: Item[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    item_id: '',
    weight: 10,
    quantity_min: 1,
    quantity_max: 3,
    gather_time_ms: 5000,
    required_skill_name: '',
  });

  function handleAdd() {
    if (!form.item_id) return;
    startTransition(async () => {
      await upsertAreaBiomeLoot({
        area_biome_id: areaBiomeId,
        item_id: form.item_id,
        weight: form.weight,
        quantity_min: form.quantity_min,
        quantity_max: form.quantity_max,
        gather_time_ms: form.gather_time_ms,
        required_skill_name: form.required_skill_name || null,
        areaId,
      });
      router.refresh();
      onDone();
    });
  }

  const cell = 'py-1.5 pr-2';
  const tiny = `${inputCls} py-1 text-xs`;

  return (
    <tr className="bg-primary/5">
      <td className={cell}>
        <select
          value={form.item_id}
          onChange={e => setForm(p => ({ ...p, item_id: e.target.value }))}
          className={`${tiny} w-full`}
        >
          <option value="">Pick item…</option>
          {items.map(it => (
            <option key={it.id} value={it.id}>
              {it.display_name} ({it.type})
            </option>
          ))}
        </select>
      </td>
      <td className={cell}>
        <input type="number" min={1} value={form.weight}
          onChange={e => setForm(p => ({ ...p, weight: Number(e.target.value) }))}
          className={`${tiny} w-16`} />
      </td>
      <td className={cell}>
        <input type="number" min={1} value={form.quantity_min}
          onChange={e => setForm(p => ({ ...p, quantity_min: Number(e.target.value) }))}
          className={`${tiny} w-16`} />
      </td>
      <td className={cell}>
        <input type="number" min={1} value={form.quantity_max}
          onChange={e => setForm(p => ({ ...p, quantity_max: Number(e.target.value) }))}
          className={`${tiny} w-16`} />
      </td>
      <td className={cell}>
        <input type="number" min={100} step={500} value={form.gather_time_ms}
          onChange={e => setForm(p => ({ ...p, gather_time_ms: Number(e.target.value) }))}
          className={`${tiny} w-24`} />
      </td>
      <td className={cell}>
        <input type="text" value={form.required_skill_name}
          onChange={e => setForm(p => ({ ...p, required_skill_name: e.target.value }))}
          placeholder="woodcutting…"
          className={`${tiny} w-28`} />
      </td>
      <td className="py-1.5">
        <div className="flex gap-1">
          <button onClick={handleAdd} disabled={isPending || !form.item_id} className={btnSecondary}>
            {isPending ? '…' : 'Add'}
          </button>
          <button onClick={onDone} className="px-2 py-1 text-xs text-muted-foreground hover:text-body">✕</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Biome card (shows one biome's loot drops) ────────────────────────────────

function BiomeCard({
  areaBiome,
  biome,
  areaId,
  allItems,
}: {
  areaBiome: AreaBiome;
  biome: Biome;
  areaId: string;
  allItems: Item[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addingLoot, setAddingLoot] = useState(false);

  const itemMap = Object.fromEntries(allItems.map(it => [it.id, it]));

  function handleRemoveBiome() {
    if (!confirm(`Remove ${biome.display_name} from this area? All its loot drops will be deleted.`)) return;
    startTransition(async () => {
      await removeBiomeFromArea(areaBiome.id, areaId);
      router.refresh();
    });
  }

  function handleRemoveLoot(lootId: string) {
    startTransition(async () => {
      await deleteAreaBiomeLoot(lootId, areaId);
      router.refresh();
    });
  }

  return (
    <div className="bg-background border border-border rounded-lg overflow-hidden">
      {/* Biome header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-accent/20">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{biome.icon}</span>
          <span className="font-semibold text-sm text-heading">{biome.display_name}</span>
          <span className="text-xs text-muted-foreground">
            ({areaBiome.area_biome_loot.length} drop{areaBiome.area_biome_loot.length !== 1 ? 's' : ''})
          </span>
        </div>
        <button onClick={handleRemoveBiome} disabled={isPending} className={btnDestructive}>
          Remove
        </button>
      </div>

      {/* Loot table */}
      <div className="p-3">
        {areaBiome.area_biome_loot.length === 0 && !addingLoot && (
          <p className="text-xs text-muted-foreground italic py-2 px-1">No loot drops yet.</p>
        )}

        {(areaBiome.area_biome_loot.length > 0 || addingLoot) && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/50">
                  <th className="pb-1.5 text-left font-semibold">Item</th>
                  <th className="pb-1.5 text-left font-semibold">Weight</th>
                  <th className="pb-1.5 text-left font-semibold">Min</th>
                  <th className="pb-1.5 text-left font-semibold">Max</th>
                  <th className="pb-1.5 text-left font-semibold">Time (ms)</th>
                  <th className="pb-1.5 text-left font-semibold">Skill</th>
                  <th className="pb-1.5" />
                </tr>
              </thead>
              <tbody>
                {areaBiome.area_biome_loot.map(row => {
                  const item = itemMap[row.item_id];
                  return (
                    <tr key={row.id} className="border-b border-border/30 last:border-0">
                      <td className="py-1.5 pr-2 text-body font-medium">{item?.display_name ?? row.item_id}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.weight}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.quantity_min}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.quantity_max}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.gather_time_ms}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.required_skill_name ?? '—'}</td>
                      <td className="py-1.5">
                        <button
                          onClick={() => handleRemoveLoot(row.id)}
                          disabled={isPending}
                          className="text-destructive hover:opacity-70 disabled:opacity-30 text-base leading-none"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {addingLoot && (
                  <AddLootRow
                    areaBiomeId={areaBiome.id}
                    areaId={areaId}
                    items={allItems}
                    onDone={() => setAddingLoot(false)}
                  />
                )}
              </tbody>
            </table>
          </div>
        )}

        {!addingLoot && (
          <button
            onClick={() => setAddingLoot(true)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            + Add Loot Drop
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main AreaForm component ──────────────────────────────────────────────────

export function AreaForm({
  areaId,
  initial,
  allBiomes,
  areaBiomes,
  allItems,
}: {
  areaId: string | null;
  initial: AreaData;
  allBiomes: Biome[];
  areaBiomes: AreaBiome[];
  allItems: Item[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [area, setArea] = useState<AreaData>(initial);
  const [addBiomeId, setAddBiomeId] = useState('');

  const isNew = !areaId;
  const biomeMap = Object.fromEntries(allBiomes.map(b => [b.id, b]));
  const existingBiomeIds = new Set(areaBiomes.map(ab => ab.biome_id));
  const availableBiomesToAdd = allBiomes.filter(b => !existingBiomeIds.has(b.id));

  function notify(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const id = await upsertArea(areaId, area);
        if (isNew) {
          router.push(`/admin/world/${id}`);
        } else {
          notify('Area saved');
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleDelete() {
    if (!areaId) return;
    if (!confirm(`Delete "${area.display_name}"? All biomes and loot for this area will be removed.`)) return;
    startTransition(async () => {
      try {
        await deleteArea(areaId);
        router.push('/admin/world');
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleAddBiome() {
    if (!addBiomeId || !areaId) return;
    startTransition(async () => {
      try {
        await addBiomeToArea(areaId, addBiomeId);
        setAddBiomeId('');
        router.refresh();
        notify('Biome added');
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm text-green-400">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5 items-start">

        {/* ── Left: Area details ─────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Area Details</p>

          <Field label="Display Name">
            <input
              type="text"
              value={area.display_name}
              onChange={e => setArea(p => ({ ...p, display_name: e.target.value }))}
              placeholder="Verdant Valley"
              className={inputCls}
            />
          </Field>
          <Field label="Internal Name">
            <input
              type="text"
              value={area.name}
              onChange={e => setArea(p => ({ ...p, name: e.target.value }))}
              placeholder="verdant_valley"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tier">
              <input
                type="number"
                min={1}
                max={20}
                value={area.tier}
                onChange={e => setArea(p => ({ ...p, tier: Number(e.target.value) }))}
                className={inputCls}
              />
            </Field>
            <Field label="Icon (emoji)">
              <input
                type="text"
                value={area.icon}
                onChange={e => setArea(p => ({ ...p, icon: e.target.value }))}
                placeholder="🗺️"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Sort Order">
            <input
              type="number"
              min={0}
              value={area.sort_order}
              onChange={e => setArea(p => ({ ...p, sort_order: Number(e.target.value) }))}
              className={inputCls}
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={3}
              value={area.description}
              onChange={e => setArea(p => ({ ...p, description: e.target.value }))}
              placeholder="A lush valley home to…"
              className={`${inputCls} resize-y`}
            />
          </Field>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={handleSave} disabled={isPending} className={`${btnPrimary} flex-1`}>
              {isPending ? 'Saving…' : isNew ? 'Create Area' : 'Save Changes'}
            </button>
            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="px-3 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* ── Right: Biomes + Loot ───────────────────────────────────────── */}
        <div className="space-y-4">
          {isNew ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center text-muted-foreground">
              <p className="text-4xl mb-3">🌍</p>
              <p className="text-sm">Save the area first, then add biomes and loot drops.</p>
            </div>
          ) : (
            <>
              {/* Header row with "Add biome" control */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Biomes ({areaBiomes.length})
                </p>
                {availableBiomesToAdd.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      value={addBiomeId}
                      onChange={e => setAddBiomeId(e.target.value)}
                      className={`${inputCls} py-1.5 text-xs`}
                    >
                      <option value="">Add biome…</option>
                      {availableBiomesToAdd.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.icon} {b.display_name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddBiome}
                      disabled={!addBiomeId || isPending}
                      className={`${btnSecondary} whitespace-nowrap`}
                    >
                      + Add
                    </button>
                  </div>
                )}
              </div>

              {areaBiomes.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-10 text-center text-muted-foreground">
                  <p className="text-3xl mb-2">🌿</p>
                  <p className="text-sm">
                    No biomes yet. Add a biome to define what players encounter in this area.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {areaBiomes.map(ab => {
                    const biome = biomeMap[ab.biome_id];
                    if (!biome) return null;
                    return (
                      <BiomeCard
                        key={ab.id}
                        areaBiome={ab}
                        biome={biome}
                        areaId={areaId}
                        allItems={allItems}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
