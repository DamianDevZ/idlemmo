'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveConfigValues } from '../formulas/actions';

interface Row {
  key: string;
  value: number;
  default_value: number;
}

interface Props {
  rows: Row[];
}

const META: Record<string, { label: string; desc: string; unit: string; isRate: boolean }> = {
  stat_tier1_rate: { label: 'Tier 1 rate',  desc: 'Damage per stat point — levels 1–cap1',     unit: 'dmg/pt', isRate: true  },
  stat_tier2_rate: { label: 'Tier 2 rate',  desc: 'Damage per stat point — levels cap1+1–cap2', unit: 'dmg/pt', isRate: true  },
  stat_tier3_rate: { label: 'Tier 3 rate',  desc: 'Damage per stat point — levels cap2+1–cap3', unit: 'dmg/pt', isRate: true  },
  stat_tier4_rate: { label: 'Tier 4 rate',  desc: 'Damage per stat point — levels cap3+',       unit: 'dmg/pt', isRate: true  },
  stat_tier1_cap:  { label: 'Tier 1 cap',   desc: 'Tier 1 rate applies up to this stat level',  unit: 'lvl',    isRate: false },
  stat_tier2_cap:  { label: 'Tier 2 cap',   desc: 'Tier 2 rate applies up to this stat level',  unit: 'lvl',    isRate: false },
  stat_tier3_cap:  { label: 'Tier 3 cap',   desc: 'Tier 3 rate applies up to this stat level',  unit: 'lvl',    isRate: false },
};

const KEY_ORDER = ['stat_tier1_rate', 'stat_tier2_rate', 'stat_tier3_rate', 'stat_tier4_rate', 'stat_tier1_cap', 'stat_tier2_cap', 'stat_tier3_cap'];

export default function StatScalingClient({ rows }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(rows.map(r => [r.key, r.value]))
  );
  const [dirty, setDirty]   = useState(false);
  const [saving, setSaving] = useState(false);

  function set(key: string, val: number) {
    setValues(v => ({ ...v, [key]: val }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    await saveConfigValues(Object.entries(values).map(([key, value]) => ({ key, value })));
    setSaving(false);
    setDirty(false);
    router.refresh();
  }

  function reset() {
    const defaults = Object.fromEntries(rows.map(r => [r.key, r.default_value]));
    setValues(defaults);
    setDirty(true);
  }

  const rateRows = KEY_ORDER.filter(k => META[k]?.isRate).map(k => ({ key: k, value: values[k] ?? 0, meta: META[k] }));
  const capRows  = KEY_ORDER.filter(k => !META[k]?.isRate).map(k => ({ key: k, value: values[k] ?? 0, meta: META[k] }));

  // Max rate for bar scaling
  const maxRate = Math.max(...rateRows.map(r => r.value), 1);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <p className="text-sm font-medium text-heading">📐 Stat → Damage Rates</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          How much flat damage each stat point adds at each level range, and where each range ends.
        </p>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Rates */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Rates (damage per point)</p>
          {rateRows.map(({ key, value, meta }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <p className="text-xs font-medium text-body">{meta.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{meta.desc}</p>
              </div>
              {/* Bar */}
              <div className="flex-1 h-1.5 bg-border/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (value / maxRate) * 100)}%` }}
                />
              </div>
              <input
                type="number"
                min={0} max={100} step={0.5}
                value={value}
                onChange={e => set(key, Number(e.target.value))}
                className="w-16 text-sm bg-background border border-border rounded-md px-2 py-1 text-right text-body focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
              />
              <span className="text-[10px] text-muted-foreground w-10 shrink-0">{meta.unit}</span>
            </div>
          ))}
        </div>

        {/* Caps */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tier caps (stat level)</p>
          {capRows.map(({ key, value, meta }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <p className="text-xs font-medium text-body">{meta.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{meta.desc}</p>
              </div>
              <div className="flex-1 h-1.5 bg-border/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500/50 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (value / 200) * 100)}%` }}
                />
              </div>
              <input
                type="number"
                min={1} max={999} step={1}
                value={value}
                onChange={e => set(key, Number(e.target.value))}
                className="w-16 text-sm bg-background border border-border rounded-md px-2 py-1 text-right text-body focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
              />
              <span className="text-[10px] text-muted-foreground w-10 shrink-0">{meta.unit}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-3 border-t border-border flex items-center justify-between">
        <button
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-body transition-colors"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save rates'}
          </button>
        </div>
      </div>
    </div>
  );
}
