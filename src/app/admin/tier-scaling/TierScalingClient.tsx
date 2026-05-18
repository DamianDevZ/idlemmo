'use client';

import { useState, useTransition } from 'react';
import { upsertTierScalingRows, deleteTierScalingStat } from '@/features/admin/tier-scaling-actions';
import type { TierScalingRow } from '@/features/admin/tier-scaling-actions';

const ITEM_TYPES = [
  { key: 'weapon',         label: '⚔️  Weapon' },
  { key: 'armor',          label: '🛡️  Armor' },
  { key: 'tool',           label: '⛏️  Tool' },
  { key: 'consumable',     label: '🧪  Consumable' },
  { key: 'special_attack', label: '✨  Ultimate' },
  { key: 'material',       label: '🪵  Material' },
];

// Suggested stat keys when adding a new stat row
const STAT_SUGGESTIONS: Record<string, { key: string; label: string }[]> = {
  weapon:         [{ key: 'base_damage', label: 'Base Damage' }],
  armor:          [{ key: 'base_defense', label: 'Base Defense' }],
  tool:           [{ key: 'yield_min', label: 'Yield Min' }, { key: 'yield_max', label: 'Yield Max' }],
  consumable:     [{ key: 'effect_value', label: 'Effect Value' }],
  special_attack: [{ key: 'base_damage', label: 'Base Damage' }],
  material:       [],
};

type StatMap = Record<string, { label: string; tiers: Record<number, number> }>;

function buildStatMap(rows: TierScalingRow[], itemType: string): StatMap {
  return rows
    .filter(r => r.item_type === itemType)
    .reduce<StatMap>((acc, r) => {
      if (!acc[r.stat_key]) acc[r.stat_key] = { label: r.stat_label, tiers: {} };
      acc[r.stat_key].tiers[r.tier] = r.multiplier;
      return acc;
    }, {});
}

export function TierScalingClient({
  rows: initialRows,
  maxTier,
}: {
  rows: TierScalingRow[];
  maxTier: number;
}) {
  const [activeType, setActiveType] = useState('weapon');
  const [rows, setRows] = useState<TierScalingRow[]>(initialRows);
  const [newStatKey, setNewStatKey] = useState('');
  const [newStatLabel, setNewStatLabel] = useState('');
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const tierNums = Array.from({ length: maxTier }, (_, i) => i + 1);
  const statMap = buildStatMap(rows, activeType);
  const statKeys = Object.keys(statMap);

  function setMultiplier(stat_key: string, tier: number, value: number) {
    setRows(prev => {
      const idx = prev.findIndex(
        r => r.item_type === activeType && r.stat_key === stat_key && r.tier === tier
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], multiplier: value };
        return next;
      }
      return [...prev, {
        item_type: activeType,
        stat_key,
        stat_label: statMap[stat_key]?.label ?? stat_key,
        tier,
        multiplier: value,
      }];
    });
  }

  function addStat() {
    const key = newStatKey.trim().toLowerCase().replace(/\s+/g, '_');
    const label = newStatLabel.trim();
    if (!key || !label) return;
    if (statMap[key]) {
      setStatus('That stat already exists for this type.');
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    const newRows: TierScalingRow[] = tierNums.map(t => ({
      item_type: activeType,
      stat_key: key,
      stat_label: label,
      tier: t,
      multiplier: 1.0,
    }));
    setRows(prev => [...prev, ...newRows]);
    setNewStatKey('');
    setNewStatLabel('');
  }

  function handleSave() {
    const toSave = rows.filter(r => r.item_type === activeType);
    startTransition(async () => {
      try {
        await upsertTierScalingRows(toSave);
        setStatus('Saved!');
      } catch {
        setStatus('Error saving.');
      } finally {
        setTimeout(() => setStatus(null), 3000);
      }
    });
  }

  function handleDeleteStat(stat_key: string) {
    if (!confirm(`Remove "${statMap[stat_key].label}" scaling from ${activeType}s?`)) return;
    setRows(prev => prev.filter(r => !(r.item_type === activeType && r.stat_key === stat_key)));
    startTransition(async () => {
      await deleteTierScalingStat(activeType, stat_key);
    });
  }

  const suggestions = STAT_SUGGESTIONS[activeType] ?? [];

  return (
    <div className="space-y-4">
      {/* Type tabs */}
      <div className="flex gap-2 flex-wrap">
        {ITEM_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveType(t.key)}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
              activeType === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-body hover:border-primary/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Scaling grid */}
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-muted-foreground font-medium w-40">Stat</th>
              {tierNums.map(t => (
                <th key={t} className="p-3 text-center text-muted-foreground font-medium min-w-[72px]">
                  T{t}
                </th>
              ))}
              <th className="p-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {statKeys.length === 0 ? (
              <tr>
                <td colSpan={maxTier + 2} className="p-8 text-center text-muted-foreground text-sm">
                  No stats configured for this type. Add one below.
                </td>
              </tr>
            ) : (
              statKeys.map(stat_key => (
                <tr key={stat_key} className="border-b border-border last:border-0 hover:bg-background/40">
                  <td className="p-3">
                    <div className="font-medium text-body">{statMap[stat_key].label}</div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{stat_key}</div>
                  </td>
                  {tierNums.map(t => (
                    <td key={t} className="p-1.5 text-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={statMap[stat_key].tiers[t] ?? 1.0}
                        onChange={e => setMultiplier(stat_key, t, Number(e.target.value) || 1)}
                        className="w-16 px-2 py-1 text-center text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                  ))}
                  <td className="p-2 text-center">
                    <button
                      onClick={() => handleDeleteStat(stat_key)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add stat */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add scalable stat</p>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="space-y-1 flex-1 min-w-[140px]">
            <label className="text-xs text-muted-foreground">Stat key</label>
            <input
              value={newStatKey}
              onChange={e => setNewStatKey(e.target.value)}
              placeholder={suggestions[0]?.key ?? 'stat_key'}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[140px]">
            <label className="text-xs text-muted-foreground">Display label</label>
            <input
              value={newStatLabel}
              onChange={e => setNewStatLabel(e.target.value)}
              placeholder={suggestions[0]?.label ?? 'Display Label'}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            onClick={addStat}
            disabled={!newStatKey || !newStatLabel}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            Add (all tiers at 1.0×)
          </button>
        </div>
        {suggestions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Suggested for {activeType}s:{' '}
            {suggestions.map(s => (
              <button
                key={s.key}
                onClick={() => { setNewStatKey(s.key); setNewStatLabel(s.label); }}
                className="text-primary hover:underline mr-2 font-mono"
              >
                {s.key}
              </button>
            ))}
          </p>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
        {status && (
          <span className={`text-sm ${status.startsWith('Error') ? 'text-destructive' : 'text-muted-foreground'}`}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
