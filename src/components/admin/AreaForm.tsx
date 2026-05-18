'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  upsertArea,
  deleteArea,
  upsertAreaTierLoot,
  deleteAreaTierLoot,
  uploadAreaImage,
} from '@/features/admin/world-actions';

// ─── Types ────────────────────────────────────────────────────────────────────

type AreaData = {
  name: string;
  display_name: string;
  description: string;
  icon: string;
  sort_order: number;
};

type TierLootRow = {
  id: string;
  tier: number;
  item_id: string;
  item_tier: number | null;
  weight: number;
};

type Item = { id: string; display_name: string; type: string; name: string; is_tiered: boolean };

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

// ─── Inline form to add a new loot row for a tier ─────────────────────────────

function AddLootRow({
  areaId,
  tier,
  items,
  maxTier,
  onDone,
}: {
  areaId: string;
  tier: number;
  items: Item[];
  maxTier: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    item_id: '',
    item_tier: tier,
    weight: 10,
  });

  const selectedItem = items.find(i => i.id === form.item_id);

  function handleAdd() {
    if (!form.item_id) return;
    startTransition(async () => {
      await upsertAreaTierLoot({
        area_id: areaId,
        tier,
        item_id: form.item_id,
        item_tier: selectedItem?.is_tiered ? form.item_tier : null,
        weight: form.weight,
      });
      router.refresh();
      onDone();
    });
  }

  const tiny = `${inputCls} py-1 text-xs`;

  return (
    <tr className="bg-primary/5">
      <td className="py-1.5 pr-2">
        <div className="flex flex-col gap-1">
          <select
            value={form.item_id}
            onChange={e => setForm(p => ({ ...p, item_id: e.target.value, item_tier: tier }))}
            className={`${tiny} w-full`}
          >
            <option value="">Pick item…</option>
            {items.map(it => (
              <option key={it.id} value={it.id}>
                {it.display_name} ({it.type})
              </option>
            ))}
          </select>
          {selectedItem?.is_tiered && (
            <select
              value={form.item_tier}
              onChange={e => setForm(p => ({ ...p, item_tier: Number(e.target.value) }))}
              className={`${tiny} w-28`}
            >
              {Array.from({ length: maxTier }, (_, i) => i + 1).map(t => (
                <option key={t} value={t}>T{t}</option>
              ))}
            </select>
          )}
        </div>
      </td>
      <td className="py-1.5 pr-2">
        <input type="number" min={1} value={form.weight}
          onChange={e => setForm(p => ({ ...p, weight: Number(e.target.value) }))}
          className={`${tiny} w-16`} />
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

// ─── A single tier section with its loot drops ───────────────────────────────

function TierSection({
  tier,
  rows,
  areaId,
  allItems,
  maxTier,
}: {
  tier: number;
  rows: TierLootRow[];
  areaId: string;
  allItems: Item[];
  maxTier: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  const itemMap = Object.fromEntries(allItems.map(it => [it.id, it]));

  function handleRemove(lootId: string) {
    startTransition(async () => {
      await deleteAreaTierLoot(lootId, areaId);
      router.refresh();
    });
  }

  return (
    <div className="bg-background border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-accent/20">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">T{tier}</span>
          <span className="text-sm font-semibold text-heading">Tier {tier}</span>
          <span className="text-xs text-muted-foreground">({rows.length} drop{rows.length !== 1 ? 's' : ''})</span>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-primary hover:underline">
            + Add Drop
          </button>
        )}
      </div>

      <div className="p-3">
        {rows.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground italic py-2">No drops for T{tier} yet.</p>
        )}

        {(rows.length > 0 || adding) && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/50">
                  <th className="pb-1.5 text-left font-semibold">Item</th>
                  <th className="pb-1.5 text-left font-semibold">Weight</th>
                  <th className="pb-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const item = itemMap[row.item_id];
                  return (
                    <tr key={row.id} className="border-b border-border/30 last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-body">
                        {item?.display_name ?? row.item_id}
                        {row.item_tier != null && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(T{row.item_tier})</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.weight}</td>
                      <td className="py-1.5">
                        <button
                          onClick={() => handleRemove(row.id)}
                          disabled={isPending}
                          className="text-destructive hover:opacity-70 disabled:opacity-30 text-base leading-none"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {adding && (
                  <AddLootRow
                    areaId={areaId}
                    tier={tier}
                    items={allItems}
                    maxTier={maxTier}
                    onDone={() => setAdding(false)}
                  />
                )}
              </tbody>
            </table>
          </div>
        )}

        {!adding && rows.length === 0 && (
          <button onClick={() => setAdding(true)} className="mt-1 text-xs text-primary hover:underline">
            + Add Drop
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main AreaForm ────────────────────────────────────────────────────────────

export function AreaForm({
  areaId,
  initial,
  lootRows,
  allItems,
  maxTier,
  imageUrl: initialImageUrl,
}: {
  areaId: string | null;
  initial: AreaData;
  lootRows: TierLootRow[];
  allItems: Item[];
  maxTier: number;
  imageUrl: string | null;
}) {
  const tiers = Array.from({ length: maxTier }, (_, i) => i + 1);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [imgPending, startImgTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [area, setArea] = useState<AreaData>(initial);
  const [imgUrl, setImgUrl] = useState<string | null>(initialImageUrl);

  const isNew = !areaId;

  // Group loot rows by tier for rendering
  const lootByTier: Record<number, TierLootRow[]> = {};
  for (const row of lootRows) {
    (lootByTier[row.tier] ??= []).push(row);
  }

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
          notify('Saved');
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !areaId) return;
    const fd = new FormData();
    fd.append('image', file);
    startImgTransition(async () => {
      try {
        const url = await uploadAreaImage(areaId, fd);
        setImgUrl(url);
        notify('Image uploaded');
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleDelete() {
    if (!areaId) return;
    if (!confirm(`Delete "${area.display_name}"? All its loot drops will be removed.`)) return;
    startTransition(async () => {
      try {
        await deleteArea(areaId);
        router.push('/admin/world');
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

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5 items-start">

        {/* ── Left: Area details ─────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Area Details</p>

          <Field label="Display Name">
            <input type="text" value={area.display_name}
              onChange={e => setArea(p => ({ ...p, display_name: e.target.value }))}
              placeholder="Eldervale Forest" className={inputCls} />
          </Field>
          <Field label="Internal Name">
            <input type="text" value={area.name}
              onChange={e => setArea(p => ({ ...p, name: e.target.value }))}
              placeholder="eldervale_forest" className={inputCls} />
          </Field>
          <Field label="Icon">
            <input type="text" value={area.icon}
              onChange={e => setArea(p => ({ ...p, icon: e.target.value }))}
              placeholder="🌲" className={inputCls} />
          </Field>
          <Field label="Sort Order">
            <input type="number" min={0} value={area.sort_order}
              onChange={e => setArea(p => ({ ...p, sort_order: Number(e.target.value) }))}
              className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea rows={3} value={area.description}
              onChange={e => setArea(p => ({ ...p, description: e.target.value }))}
              placeholder="Ancient woodland filled with…"
              className={`${inputCls} resize-y`} />
          </Field>

          <Field label="Area Image">
            {isNew ? (
              <p className="text-xs text-muted-foreground italic">Save the area first to upload an image.</p>
            ) : (
              <div className="space-y-2">
                {imgUrl ? (
                  <img src={imgUrl} alt="" className="w-full rounded-md object-cover" style={{ maxHeight: '96px' }} />
                ) : (
                  <div className="w-full rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground text-xs" style={{ height: '80px' }}>
                    No image yet
                  </div>
                )}
                <label className={`${btnSecondary} cursor-pointer inline-block ${imgPending ? 'opacity-50 pointer-events-none' : ''}`}>
                  {imgPending ? 'Uploading…' : imgUrl ? 'Replace Image' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={imgPending}
                    onChange={handleImageChange}
                  />
                </label>
              </div>
            )}
          </Field>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={handleSave} disabled={isPending} className={`${btnPrimary} flex-1`}>
              {isPending ? 'Saving…' : isNew ? 'Create Area' : 'Save Changes'}
            </button>
            {!isNew && (
              <button onClick={handleDelete} disabled={isPending}
                className="px-3 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50">
                Delete
              </button>
            )}
          </div>
        </div>

        {/* ── Right: Per-tier loot tables ────────────────────────────────── */}
        <div className="space-y-3">
          {isNew ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center text-muted-foreground">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm">Create the area first, then set up loot drops per tier.</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Loot Drops by Tier
              </p>
              {tiers.map(t => (
                <TierSection
                  key={t}
                  tier={t}
                  rows={lootByTier[t] ?? []}
                  areaId={areaId}
                  allItems={allItems}
                  maxTier={maxTier}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

