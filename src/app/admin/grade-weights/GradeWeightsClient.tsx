'use client';

import { useState, useTransition } from 'react';
import { saveConfigValues } from '@/app/admin/formulas/actions';

const GRADE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  grade_weight_s: { label: 'S', color: 'text-amber-400', desc: 'Supreme — rarest quality' },
  grade_weight_a: { label: 'A', color: 'text-violet-400', desc: 'Exceptional' },
  grade_weight_b: { label: 'B', color: 'text-blue-400',   desc: 'Superior' },
  grade_weight_c: { label: 'C', color: 'text-emerald-400',desc: 'Standard' },
  grade_weight_d: { label: 'D', color: 'text-yellow-500', desc: 'Below average' },
  grade_weight_f: { label: 'F', color: 'text-muted-foreground', desc: 'Junk — most common' },
};

interface Row {
  key: string;
  value: number;
  default_value: number;
  min_value: number;
  max_value: number;
}

export default function GradeWeightsClient({ rows }: { rows: Row[] }) {
  const [values, setValues]       = useState<Record<string, number>>(
    Object.fromEntries(rows.map(r => [r.key, r.value]))
  );
  const [savedValues, setSaved]   = useState<Record<string, number>>(
    Object.fromEntries(rows.map(r => [r.key, r.value]))
  );
  const [flash, setFlash]         = useState<'saved' | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [pending, startTransition] = useTransition();

  const total  = Object.values(values).reduce((s, v) => s + v, 0);
  const anyDirty = rows.some(r => values[r.key] !== savedValues[r.key]);

  function handleChange(key: string, raw: string) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      setValues(prev => ({ ...prev, [key]: n }));
      setFlash(null);
    }
  }

  function handleSave() {
    setErrorMsg('');
    const dirty = rows.filter(r => values[r.key] !== savedValues[r.key]).map(r => ({ key: r.key, value: values[r.key] }));
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
    const defaults = Object.fromEntries(rows.map(r => [r.key, r.default_value]));
    setValues(defaults);
    setFlash(null);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <p className="text-sm font-medium text-heading">Grade Weights</p>
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

      {/* Inputs */}
      <div className="px-6 py-5 space-y-3">
        {rows.map(row => {
          const meta  = GRADE_LABELS[row.key];
          const pct   = total > 0 ? ((values[row.key] / total) * 100).toFixed(1) : '0.0';
          const dirty = values[row.key] !== savedValues[row.key];
          return (
            <div key={row.key} className="flex items-center gap-4">
              {/* Grade badge */}
              <div className={`w-8 h-8 rounded-md border border-border flex items-center justify-center font-bold text-sm ${meta.color} bg-background shrink-0`}>
                {meta.label}
              </div>

              {/* Label */}
              <div className="w-36 shrink-0">
                <p className="text-sm font-medium text-body">{meta.desc}</p>
              </div>

              {/* Number input */}
              <input
                type="number"
                min={row.min_value}
                max={row.max_value}
                step={1}
                value={values[row.key]}
                onChange={e => handleChange(row.key, e.target.value)}
                className={`w-24 rounded-md border bg-background px-3 py-1.5 text-sm text-body text-right transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
                  dirty ? 'border-amber-500/60' : 'border-border'
                }`}
              />

              {/* Probability bar */}
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-background border border-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">{pct}%</span>
              </div>
            </div>
          );
        })}

        <p className="text-xs text-muted-foreground pt-1">
          Total weight: <span className="font-mono text-body">{total}</span> — individual item overrides are applied before normalisation.
        </p>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="mx-6 mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
          {errorMsg}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-background/20">
        <button
          onClick={handleReset}
          disabled={pending}
          className="text-xs text-muted-foreground hover:text-body transition-colors disabled:opacity-40"
        >
          Reset to defaults
        </button>
        <button
          onClick={handleSave}
          disabled={!anyDirty || pending}
          className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {pending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
