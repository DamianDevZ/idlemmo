'use client';

import { useState, useTransition } from 'react';
import { updatePresetResistances } from '@/features/admin/preset-actions';

const DAMAGE_TYPES = ['slash','blunt','bleed','pierce','fire','ice','lightning','poison'];
const DMG_EMOJI: Record<string, string> = {
  slash: '🗡️', blunt: '🔨', bleed: '🩸', pierce: '🏹',
  fire: '🔥', ice: '❄️', lightning: '⚡', poison: '☠️',
};

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

  function setResistance(presetId: string, dtype: string, value: number) {
    setPresets(prev => prev.map(p =>
      p.id === presetId
        ? { ...p, resistances: { ...p.resistances, [dtype]: value } }
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

          <div className="flex gap-4 justify-around overflow-x-auto pb-1 pt-1">
            {DAMAGE_TYPES.map(dtype => {
              const val = preset.resistances[dtype] ?? 0;
              const valColor = val > 0 ? '#4ade80' : val < 0 ? '#f87171' : '#64748b';
              return (
                <div key={dtype} className="flex flex-col items-center gap-1.5 shrink-0">
                  <span className="text-xs font-mono font-bold" style={{ color: valColor }}>
                    {val > 0 ? '+' : ''}{val}%
                  </span>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={5}
                    value={val}
                    onChange={e => setResistance(preset.id, dtype, Number(e.target.value))}
                    className="accent-primary cursor-pointer"
                    style={{
                      writingMode: 'vertical-lr',
                      WebkitAppearance: 'slider-vertical',
                      direction: 'rtl',
                      height: '120px',
                      width: '20px',
                    }}
                  />
                  <div className="flex flex-col items-center">
                    <span className="text-base leading-none">{DMG_EMOJI[dtype]}</span>
                    <span className="text-[9px] text-muted-foreground capitalize mt-0.5">{dtype}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
