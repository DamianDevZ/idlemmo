'use client';

import { useState, useTransition } from 'react';
import { saveConfigValues } from '@/app/admin/formulas/actions';

const GRADE_META: Record<string, { label: string; color: string; desc: string }> = {
  grade_mult_s: { label: 'S', color: 'text-amber-400',       desc: 'Supreme' },
  grade_mult_a: { label: 'A', color: 'text-violet-400',      desc: 'Exceptional' },
  grade_mult_b: { label: 'B', color: 'text-blue-400',        desc: 'Superior' },
  grade_mult_c: { label: 'C', color: 'text-emerald-400',     desc: 'Standard' },
  grade_mult_d: { label: 'D', color: 'text-yellow-500',      desc: 'Below average' },
  grade_mult_f: { label: 'F', color: 'text-muted-foreground', desc: 'Junk (baseline)' },
};

interface Row { key: string; value: number; default_value: number }

export default function GradeMultipliersClient({ rows }: { rows: Row[] }) {
  const [values, setValues]         = useState<Record<string, number>>(
    Object.fromEntries(rows.map(r => [r.key, r.value]))
  );
  const [saved, setSaved]           = useState<Record<string, number>>(
    Object.fromEntries(rows.map(r => [r.key, r.value]))
  );
  const [flash, setFlash]           = useState<'saved' | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [pending, startTransition]  = useTransition();

  const anyDirty = rows.some(r => values[r.key] !== saved[r.key]);

  function handleChange(key: string, raw: string) {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n >= 1) {
      setValues(prev => ({ ...prev, [key]: n }));
      setFlash(null);
    }
  }

  function handleSave() {
    setErrorMsg('');
    const dirty = rows.filter(r => values[r.key] !== saved[r.key]).map(r => ({ key: r.key, value: values[r.key] }));
    if (!dirty.length) return;
    startTransition(async () => {
      const result = await saveConfigValues(dirty);
      if (result.error) {
        setErrorMsg(result.error);
      } else {
        setSaved({ ...values });
        setFlash('saved');
      }
    });
  }

  function handleReset() {
    setValues(Object.fromEntries(rows.map(r => [r.key, r.default_value])));
    setFlash(null);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <p className="text-sm font-medium text-heading">Grade Damage Multipliers</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            How much each grade amplifies your stat bonus.{' '}
            <span className="font-mono text-body">dmg = weapon_base + round(stat_bonus × mult)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {flash === 'saved' && !anyDirty && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ✓ Saved — live gameplay updated
            </span>
          )}
          {anyDirty && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      {/* Rows */}
      <div className="px-6 py-5 space-y-3">
        {rows.map(row => {
          const meta  = GRADE_META[row.key];
          const dirty = values[row.key] !== saved[row.key];
          return (
            <div key={row.key} className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-md border border-border flex items-center justify-center font-bold text-sm ${meta.color} bg-background shrink-0`}>
                {meta.label}
              </div>
              <div className="w-36 shrink-0">
                <p className="text-sm font-medium text-body">{meta.desc}</p>
              </div>
              {/* Multiplier bar — shows relative strength */}
              <div className="flex-1 h-2 rounded-full bg-background border border-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all"
                  style={{ width: `${Math.min(100, ((values[row.key] - 1.0) / (2.0)) * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                ×{values[row.key].toFixed(2)}
              </span>
              <input
                type="number"
                step="0.05"
                min="1"
                max="5"
                value={values[row.key]}
                onChange={e => handleChange(row.key, e.target.value)}
                className={`w-20 text-sm bg-background border rounded-md px-2 py-1 text-body text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${
                  dirty ? 'border-amber-500/60' : 'border-border'
                }`}
              />
            </div>
          );
        })}

        {errorMsg && (
          <p className="text-xs text-red-400 mt-1">{errorMsg}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-background/40">
        <button
          onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-body transition-colors"
        >
          Reset to defaults
        </button>
        <button
          onClick={handleSave}
          disabled={pending || !anyDirty}
          className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          {pending ? 'Saving…' : 'Save multipliers'}
        </button>
      </div>
    </div>
  );
}
