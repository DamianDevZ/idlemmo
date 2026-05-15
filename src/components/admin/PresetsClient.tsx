'use client';

import { useState, useTransition } from 'react';
import { updatePresetResistances } from '@/features/admin/preset-actions';

const DAMAGE_TYPES = ['slash','blunt','bleed','pierce','fire','ice','lightning','poison'];

type Preset = {
  id: string;
  display_name: string;
  material_type: string | null;
  resistances: Record<string, number>;
};

export function PresetsClient({ presets: initial }: { presets: Preset[] }) {
  const [presets, setPresets] = useState<Preset[]>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function setResistance(presetId: string, dtype: string, value: string) {
    setPresets(prev => prev.map(p =>
      p.id === presetId
        ? { ...p, resistances: { ...p.resistances, [dtype]: Number(value) } }
        : p
    ));
  }

  function handleSave(preset: Preset) {
    setSaving(preset.id);
    startTransition(async () => {
      try {
        await updatePresetResistances(preset.id, preset.resistances);
        setErrors(prev => { const n = { ...prev }; delete n[preset.id]; return n; });
      } catch (e) {
        setErrors(prev => ({ ...prev, [preset.id]: (e as Error).message }));
      } finally {
        setSaving(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {presets.map(preset => (
        <div key={preset.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-heading">{preset.display_name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{preset.id}</span>
              {preset.material_type && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-accent text-body">{preset.material_type}</span>
              )}
            </div>
            <button
              onClick={() => handleSave(preset)}
              disabled={isPending && saving === preset.id}
              className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving === preset.id ? 'Saving…' : 'Save'}
            </button>
          </div>

          {errors[preset.id] && (
            <p className="text-xs text-destructive">{errors[preset.id]}</p>
          )}

          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {DAMAGE_TYPES.map(dtype => {
              const val = preset.resistances[dtype] ?? 0;
              const color = val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-muted-foreground';
              return (
                <div key={dtype} className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">{dtype}</span>
                  <input
                    type="number"
                    value={val}
                    onChange={e => setResistance(preset.id, dtype, e.target.value)}
                    className={`w-full px-2 py-1 text-xs text-center bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring ${color} font-mono`}
                  />
                </div>
              );
            })}
          </div>

          {/* Visual resistance bar */}
          <div className="flex gap-1 h-2">
            {DAMAGE_TYPES.map(dtype => {
              const val = Math.max(-100, Math.min(100, preset.resistances[dtype] ?? 0));
              const color = val > 0 ? 'bg-green-500' : val < 0 ? 'bg-red-500' : 'bg-border';
              const width = Math.abs(val);
              return (
                <div key={dtype} className="flex-1 bg-accent rounded-full overflow-hidden" title={`${dtype}: ${val}%`}>
                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${width}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
