'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  upsertEnemyDef,
  deleteEnemyDef,
  upsertEnemyTierLoot,
  deleteEnemyTierLoot,
} from '@/features/admin/enemy-actions';

// ─── Types ────────────────────────────────────────────────────────────────────

type EnemyData = {
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

// ─── Inline form to add a new loot row ───────────────────────────────────────

function AddLootRow({
  enemyId,
  tier,
  items,
  maxTier,
  onDone,
}: {
  enemyId: string;
  tier: number;
  items: Item[];
  maxTier: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ item_id: '', item_tier: tier, weight: 10 });
  const selectedItem = items.find(i => i.id === form.item_id);
  const tiny = `${inputCls} py-1 text-xs`;

  function handleAdd() {
    if (!form.item_id) return;
    startTransition(async () => {
      await upsertEnemyTierLoot({
        enemy_id: enemyId,
        tier,
        item_id: form.item_id,
        item_tier: selectedItem?.is_tiered ? form.item_tier : null,
        weight: form.weight,
      });
      router.refresh();
      onDone();
    });
  }

  return (
    <tr className="bg-primary/5">
      <td className="py-1.5 pr-2">
        <div className="flex gap-1">
          <select
            value={form.item_id}
            onChange={e => setForm(p => ({ ...p, item_id: e.target.value, item_tier: tier }))}
            className={`${tiny} flex-1 min-w-0`}
          >
            <option value="">Pick item…</option>
            {items.map(it => (
              <option key={it.id} value={it.id}>{it.display_name} ({it.type})</option>
            ))}
          </select>
          {selectedItem?.is_tiered && (
            <select
              value={form.item_tier}
              onChange={e => setForm(p => ({ ...p, item_tier: Number(e.target.value) }))}
              className={`${tiny} w-14 shrink-0`}
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
      <td className="py-1.5 text-right">
        <div className="flex gap-3 justify-end">
          <button onClick={handleAdd} disabled={isPending || !form.item_id} className={btnSecondary}>
            {isPending ? '…' : 'Add'}
          </button>
          <button onClick={onDone} className="px-2 py-1 text-xs text-muted-foreground hover:text-body">✕</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Inline edit form for an existing loot row ───────────────────────────────

function EditLootRow({
  row,
  enemyId,
  items,
  maxTier,
  onDone,
}: {
  row: TierLootRow;
  enemyId: string;
  items: Item[];
  maxTier: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ item_id: row.item_id, item_tier: row.item_tier ?? 1, weight: row.weight });
  const selectedItem = items.find(i => i.id === form.item_id);
  const tiny = `${inputCls} py-1 text-xs`;

  function handleSave() {
    startTransition(async () => {
      await upsertEnemyTierLoot({
        id: row.id,
        enemy_id: enemyId,
        tier: row.tier,
        item_id: form.item_id,
        item_tier: selectedItem?.is_tiered ? form.item_tier : null,
        weight: form.weight,
      });
      router.refresh();
      onDone();
    });
  }

  return (
    <tr className="bg-primary/5">
      <td className="py-1.5 pr-2">
        <div className="flex gap-1">
          <select
            value={form.item_id}
            onChange={e => setForm(p => ({ ...p, item_id: e.target.value }))}
            className={`${tiny} flex-1 min-w-0`}
          >
            {items.map(it => (
              <option key={it.id} value={it.id}>{it.display_name} ({it.type})</option>
            ))}
          </select>
          {selectedItem?.is_tiered && (
            <select
              value={form.item_tier}
              onChange={e => setForm(p => ({ ...p, item_tier: Number(e.target.value) }))}
              className={`${tiny} w-14 shrink-0`}
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
      <td className="py-1.5 text-right">
        <div className="flex gap-3 justify-end">
          <button onClick={handleSave} disabled={isPending} className={btnSecondary}>
            {isPending ? '…' : 'Save'}
          </button>
          <button onClick={onDone} className="px-2 py-1 text-xs text-muted-foreground hover:text-body">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Per-tier loot section ────────────────────────────────────────────────────

function TierSection({
  tier,
  rows,
  enemyId,
  allItems,
  maxTier,
}: {
  tier: number;
  rows: TierLootRow[];
  enemyId: string;
  allItems: Item[];
  maxTier: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const itemMap = Object.fromEntries(allItems.map(it => [it.id, it]));

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
                  <th className="pb-1.5 text-right" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const item = itemMap[row.item_id];
                  if (editingId === row.id) {
                    return (
                      <EditLootRow
                        key={row.id}
                        row={row}
                        enemyId={enemyId}
                        items={allItems}
                        maxTier={maxTier}
                        onDone={() => setEditingId(null)}
                      />
                    );
                  }
                  return (
                    <tr key={row.id} className="border-b border-border/30 last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-body">
                        {item?.display_name ?? row.item_id}
                        {row.item_tier != null && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(T{row.item_tier})</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.weight}</td>
                      <td className="py-1.5 text-right">
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={() => setEditingId(row.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              startTransition(async () => {
                                await deleteEnemyTierLoot(row.id, enemyId);
                                router.refresh();
                              });
                            }}
                            disabled={isPending}
                            className="text-xs text-destructive hover:underline disabled:opacity-30"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {adding && (
                  <AddLootRow
                    enemyId={enemyId}
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

// ─── Main EnemyForm ───────────────────────────────────────────────────────────

export function EnemyForm({
  enemyId,
  initial,
  lootRows,
  allItems,
  maxTier,
}: {
  enemyId: string | null;
  initial: EnemyData;
  lootRows: TierLootRow[];
  allItems: Item[];
  maxTier: number;
}) {
  const tiers = Array.from({ length: maxTier }, (_, i) => i + 1);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [enemy, setEnemy] = useState<EnemyData>(initial);
  const isNew = !enemyId;

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
        const id = await upsertEnemyDef(enemyId, enemy);
        if (isNew) {
          router.push(`/admin/enemies/${id}`);
        } else {
          notify('Saved');
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleDelete() {
    if (!enemyId) return;
    if (!confirm(`Delete "${enemy.display_name}"? All its loot drops will be removed.`)) return;
    startTransition(async () => {
      try {
        await deleteEnemyDef(enemyId);
        router.push('/admin/enemies');
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

        {/* ── Left: Enemy details ─────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Enemy Details</p>

          <Field label="Display Name">
            <input type="text" value={enemy.display_name}
              onChange={e => setEnemy(p => ({ ...p, display_name: e.target.value }))}
              placeholder="Forest Wolf" className={inputCls} />
          </Field>
          <Field label="Internal Name">
            <input type="text" value={enemy.name}
              onChange={e => setEnemy(p => ({ ...p, name: e.target.value }))}
              placeholder="forest_wolf" className={inputCls} />
          </Field>
          <Field label="Icon">
            <input type="text" value={enemy.icon}
              onChange={e => setEnemy(p => ({ ...p, icon: e.target.value }))}
              placeholder="🐺" className={inputCls} />
          </Field>
          <Field label="Sort Order">
            <input type="number" min={0} value={enemy.sort_order}
              onChange={e => setEnemy(p => ({ ...p, sort_order: Number(e.target.value) }))}
              className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea rows={3} value={enemy.description}
              onChange={e => setEnemy(p => ({ ...p, description: e.target.value }))}
              placeholder="A fierce wolf lurking in the woods…"
              className={`${inputCls} resize-y`} />
          </Field>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={handleSave} disabled={isPending} className={`${btnPrimary} flex-1`}>
              {isPending ? 'Saving…' : isNew ? 'Create Enemy' : 'Save Changes'}
            </button>
            {!isNew && (
              <button onClick={handleDelete} disabled={isPending}
                className="px-3 py-2 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50">
                Delete
              </button>
            )}
          </div>
        </div>

        {/* ── Right: Per-tier loot tables ─────────────────────────────────── */}
        <div className="space-y-3">
          {isNew ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center text-muted-foreground">
              <p className="text-4xl mb-3">🗡️</p>
              <p className="text-sm">Create the enemy first, then set up loot drops per tier.</p>
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
                  enemyId={enemyId}
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


// ─── Shared primitives ────────────────────────────────────────────────────────

const inputCls =
  'px-3 py-2 text-sm bg-background border border-border rounded-md text-body ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />;
}

function Sel({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...props} className={inputCls}>
      {children}
    </select>
  );
}

// ─── EnemyForm ────────────────────────────────────────────────────────────────

