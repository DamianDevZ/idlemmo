'use client';

import { useState, useTransition } from 'react';
import { saveCategoryProgression, type CategoryProgressionUpdate } from './actions';

type Category = {
  id: string;
  name: string;
  display_name: string;
  action_xp_per_unit: number;
  tier_xp_base: number;
  tier_xp_scaling: number;
};

// Describes what "1 unit" means per category — shown in the XP column header cell
const UNIT_LABELS: Record<string, string> = {
  weapon_mastery: '× combat XP',
  armor_mastery:  '× combat XP',
  tool_mastery:   'per resource',
  weapon_crafting: 'per tier',
  armor_crafting:  'per tier',
  tool_crafting:   'per tier',
  refining:        'per tier',
};

function tierCost(base: number, scaling: number, tier: number): number {
  return Math.floor(base * Math.pow(scaling, tier));
}

const PREVIEW_TIERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type RowState = {
  action_xp_per_unit: string;
  tier_xp_base: string;
  tier_xp_scaling: string;
};

export function ProgressionClient({ categories }: { categories: Category[] }) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      categories.map(c => [
        c.id,
        {
          action_xp_per_unit: String(c.action_xp_per_unit),
          tier_xp_base:       String(c.tier_xp_base),
          tier_xp_scaling:    String(c.tier_xp_scaling),
        },
      ]),
    ),
  );
  const [error, setError]       = useState<string | null>(null);
  const [saved, setSaved]       = useState(false);
  const [isPending, startTransition] = useTransition();

  function setField(id: string, field: keyof RowState, value: string) {
    setSaved(false);
    setError(null);
    setRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function handleSave() {
    const updates: CategoryProgressionUpdate[] = categories.map(c => ({
      id:                 c.id,
      action_xp_per_unit: parseFloat(rows[c.id].action_xp_per_unit),
      tier_xp_base:       parseFloat(rows[c.id].tier_xp_base),
      tier_xp_scaling:    parseFloat(rows[c.id].tier_xp_scaling),
    }));

    startTransition(async () => {
      const result = await saveCategoryProgression(updates);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/60">
              <th className="px-4 py-3 text-left font-semibold text-heading">Category</th>
              <th className="px-4 py-3 text-left font-semibold text-heading whitespace-nowrap">
                Action XP / unit
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">(unit varies)</span>
              </th>
              <th className="px-4 py-3 text-left font-semibold text-heading whitespace-nowrap">Tier XP Base</th>
              <th className="px-4 py-3 text-left font-semibold text-heading whitespace-nowrap">Scaling ×</th>
              {PREVIEW_TIERS.map(t => (
                <th key={t} className="px-3 py-3 text-right font-semibold text-heading whitespace-nowrap">
                  T{t}→{t + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, i) => {
              const row     = rows[cat.id];
              const base    = parseFloat(row.tier_xp_base)    || cat.tier_xp_base;
              const scaling = parseFloat(row.tier_xp_scaling) || cat.tier_xp_scaling;
              const unitLabel = UNIT_LABELS[cat.name] ?? '';

              return (
                <tr
                  key={cat.id}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-background' : 'bg-card/30'}`}
                >
                  {/* Category name */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-heading">{cat.display_name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{cat.name}</div>
                  </td>

                  {/* Action XP per unit */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.action_xp_per_unit}
                        onChange={e => setField(cat.id, 'action_xp_per_unit', e.target.value)}
                        className="w-24 rounded border border-border bg-background px-2 py-1 text-sm text-body focus:border-primary focus:outline-none"
                      />
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{unitLabel}</span>
                    </div>
                  </td>

                  {/* Tier XP Base */}
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      step="1"
                      value={row.tier_xp_base}
                      onChange={e => setField(cat.id, 'tier_xp_base', e.target.value)}
                      className="w-24 rounded border border-border bg-background px-2 py-1 text-sm text-body focus:border-primary focus:outline-none"
                    />
                  </td>

                  {/* Scaling */}
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      value={row.tier_xp_scaling}
                      onChange={e => setField(cat.id, 'tier_xp_scaling', e.target.value)}
                      className="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-body focus:border-primary focus:outline-none"
                    />
                  </td>

                  {/* Tier cost preview */}
                  {PREVIEW_TIERS.map(t => (
                    <td key={t} className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                      {tierCost(base, scaling, t).toLocaleString()}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && !isPending && (
          <span className="text-sm text-green-500">Saved successfully.</span>
        )}
      </div>
    </div>
  );
}
