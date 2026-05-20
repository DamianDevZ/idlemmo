'use client';

import { useState, useTransition } from 'react';
import { saveCategoryProgression, type CategoryProgressionUpdate } from './actions';

type Category = {
  id: string;
  name: string;
  display_name: string;
  action_xp_per_unit: number;
  action_xp_scaling:  number;
  tier_xp_base:       number;
  tier_xp_scaling:    number;
};

const SORT_ORDER: Record<string, number> = {
  refining: 0, tool_mastery: 1, tool_crafting: 2,
  weapon_mastery: 3, weapon_crafting: 4, armor_mastery: 5, armor_crafting: 6,
};

const GROUP_COLORS: Record<string, { border: string; bg: string }> = {
  refining:        { border: 'border-l-amber-500', bg: 'bg-amber-500/10' },
  tool_mastery:    { border: 'border-l-green-500', bg: 'bg-green-500/10' },
  tool_crafting:   { border: 'border-l-green-500', bg: 'bg-green-500/10' },
  weapon_mastery:  { border: 'border-l-red-500',   bg: 'bg-red-500/10'   },
  weapon_crafting: { border: 'border-l-red-500',   bg: 'bg-red-500/10'   },
  armor_mastery:   { border: 'border-l-blue-500',  bg: 'bg-blue-500/10'  },
  armor_crafting:  { border: 'border-l-blue-500',  bg: 'bg-blue-500/10'  },
};

const IS_TIER_BASED: Record<string, boolean> = {
  refining: true, tool_mastery: true, tool_crafting: true,
  weapon_mastery: false, weapon_crafting: true, armor_mastery: false, armor_crafting: true,
};

const inp = 'w-20 rounded border border-border bg-background px-2 py-1 text-sm text-body focus:border-primary focus:outline-none';

function earnedXp(base: number, scaling: number, tier: number): number {
  return Math.floor(base * Math.pow(scaling, Math.max(0, tier - 1)));
}
function tierCost(base: number, scaling: number, tier: number): number {
  return Math.floor(base * Math.pow(scaling, tier));
}

type RowState = {
  action_xp_per_unit: string;
  action_xp_scaling:  string;
  tier_xp_base:       string;
  tier_xp_scaling:    string;
};

export function ProgressionClient({
  categories,
  maxTier,
}: {
  categories: Category[];
  maxTier: number;
}) {
  const previewTiers = Array.from({ length: maxTier }, (_, i) => i + 1);
  const sorted = [...categories].sort((a, b) => (SORT_ORDER[a.name] ?? 99) - (SORT_ORDER[b.name] ?? 99));

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(categories.map(c => [c.id, {
      action_xp_per_unit: String(c.action_xp_per_unit),
      action_xp_scaling:  String(c.action_xp_scaling),
      tier_xp_base:       String(c.tier_xp_base),
      tier_xp_scaling:    String(c.tier_xp_scaling),
    }])),
  );
  const [error, setError]            = useState<string | null>(null);
  const [saved, setSaved]            = useState(false);
  const [isPending, startTransition] = useTransition();

  function setField(id: string, field: keyof RowState, value: string) {
    setSaved(false); setError(null);
    setRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function handleSave() {
    const updates: CategoryProgressionUpdate[] = categories.map(c => ({
      id:                 c.id,
      action_xp_per_unit: parseFloat(rows[c.id].action_xp_per_unit),
      action_xp_scaling:  parseFloat(rows[c.id].action_xp_scaling),
      tier_xp_base:       parseFloat(rows[c.id].tier_xp_base),
      tier_xp_scaling:    parseFloat(rows[c.id].tier_xp_scaling),
    }));
    startTransition(async () => {
      const result = await saveCategoryProgression(updates);
      if (result.error) setError(result.error); else setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</div>
      )}

      {sorted.map(cat => {
        const row      = rows[cat.id];
        const colors   = GROUP_COLORS[cat.name] ?? { border: 'border-l-border', bg: '' };
        const tierBased = IS_TIER_BASED[cat.name] ?? true;
        const eBase    = parseFloat(row.action_xp_per_unit) || cat.action_xp_per_unit;
        const eScaling = parseFloat(row.action_xp_scaling)  || cat.action_xp_scaling;
        const cBase    = parseFloat(row.tier_xp_base)        || cat.tier_xp_base;
        const cScaling = parseFloat(row.tier_xp_scaling)     || cat.tier_xp_scaling;

        return (
          <div key={cat.id} className={`rounded-xl border border-border border-l-4 ${colors.border} overflow-hidden`}>
            <div className={`px-4 py-2 flex items-center gap-2 ${colors.bg} border-b border-border`}>
              <span className="font-semibold text-heading text-sm">{cat.display_name}</span>
              <span className="font-mono text-xs text-muted-foreground">{cat.name}</span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-border">

              {/* Left: XP Earned per Action */}
              <div className="p-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">XP Earned per Action</p>

                <div className="flex items-end gap-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">{tierBased ? 'Base (T1)' : 'Fraction'}</div>
                    <input
                      type="number" min={0} step={tierBased ? '1' : '0.01'}
                      value={row.action_xp_per_unit}
                      onChange={e => setField(cat.id, 'action_xp_per_unit', e.target.value)}
                      className={inp}
                    />
                  </div>
                  {tierBased && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-0.5">Scaling x</div>
                      <input
                        type="number" min={1} step="0.01"
                        value={row.action_xp_scaling}
                        onChange={e => setField(cat.id, 'action_xp_scaling', e.target.value)}
                        className={inp}
                      />
                    </div>
                  )}
                </div>

                {tierBased ? (
                  <div className="flex gap-3 flex-wrap pt-1">
                    {previewTiers.map(t => (
                      <div key={t} className="flex flex-col items-center min-w-[2rem]">
                        <span className="text-[9px] text-muted-foreground">T{t}</span>
                        <span className="text-xs font-semibold text-heading tabular-nums">
                          {earnedXp(eBase, eScaling, t).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground pt-1">
                    {row.action_xp_per_unit} x combat XP &mdash; e.g. 100 combat XP ={' '}
                    <strong>{Math.round(parseFloat(row.action_xp_per_unit) * 100)}</strong> mastery XP.
                  </p>
                )}
              </div>

              {/* Right: XP Cost to Level Up */}
              <div className="p-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">XP Cost to Level Up</p>

                <div className="flex items-end gap-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">Base (T0 to T1)</div>
                    <input
                      type="number" min={1} step="1"
                      value={row.tier_xp_base}
                      onChange={e => setField(cat.id, 'tier_xp_base', e.target.value)}
                      className={inp}
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">Scaling x</div>
                    <input
                      type="number" min={1} step="0.01"
                      value={row.tier_xp_scaling}
                      onChange={e => setField(cat.id, 'tier_xp_scaling', e.target.value)}
                      className={inp}
                    />
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap pt-1">
                  {previewTiers.map(t => (
                    <div key={t} className="flex flex-col items-center min-w-[2rem]">
                      <span className="text-[9px] text-muted-foreground">T{t - 1} to {t}</span>
                      <span className="text-xs font-semibold text-heading tabular-nums">
                        {tierCost(cBase, cScaling, t - 1).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
        {saved && !isPending && <span className="text-sm text-green-500">Saved successfully.</span>}
      </div>
    </div>
  );
}