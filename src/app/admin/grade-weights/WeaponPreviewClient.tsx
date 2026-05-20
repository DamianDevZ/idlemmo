'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WeaponRow = {
  id: string;
  display_name: string;
  base_damage: number | null;
  attack_speed: number;
  primary_scaling_attr: string | null;
  is_tiered: boolean;
  tiered_stats: string[];
};

type ScalingRow = { stat_key: string; tier: number; multiplier: number };

interface Props {
  weapons: WeaponRow[];
  tierScaling: ScalingRow[];
  maxTier: number;
  gradeMults: Record<string, number>;
  statScaling: Record<string, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
type Grade = typeof GRADES[number];

// Grade multipliers now come from props (live from game_config)
const GRADE_MULT_DEFAULTS: Record<Grade, number> = { S: 1.5, A: 1.4, B: 1.3, C: 1.2, D: 1.1, F: 1.0 };

const GRADE_STYLE: Record<Grade, string> = {
  S: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  A: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  B: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  C: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  D: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  F: 'bg-border/40 text-muted-foreground border-border',
};

// Fallback defaults only — live values come from statScaling prop
const T1_RATE_DEFAULT = 5, T2_RATE_DEFAULT = 3, T3_RATE_DEFAULT = 2, T4_RATE_DEFAULT = 1;
const T1_CAP_DEFAULT  = 30, T2_CAP_DEFAULT  = 60, T3_CAP_DEFAULT  = 100;

function calcStatBonus(stat: number, s: Record<string, number>): number {
  const t1Rate = s.stat_tier1_rate ?? T1_RATE_DEFAULT;
  const t2Rate = s.stat_tier2_rate ?? T2_RATE_DEFAULT;
  const t3Rate = s.stat_tier3_rate ?? T3_RATE_DEFAULT;
  const t4Rate = s.stat_tier4_rate ?? T4_RATE_DEFAULT;
  const t1Cap  = s.stat_tier1_cap  ?? T1_CAP_DEFAULT;
  const t2Cap  = s.stat_tier2_cap  ?? T2_CAP_DEFAULT;
  const t3Cap  = s.stat_tier3_cap  ?? T3_CAP_DEFAULT;
  return (
    Math.min(stat, t1Cap) * t1Rate +
    Math.max(0, Math.min(stat, t2Cap) - t1Cap) * t2Rate +
    Math.max(0, Math.min(stat, t3Cap) - t2Cap) * t3Rate +
    Math.max(0, stat - t3Cap) * t4Rate
  );
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace(/\.0+$/, '');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeaponPreviewClient({ weapons, tierScaling, maxTier, gradeMults, statScaling }: Props) {
  const [weaponId, setWeaponId]   = useState(weapons[0]?.id ?? '');
  const [grade, setGrade]         = useState<Grade>('A');
  const [attrLevel, setAttrLevel] = useState(20);

  const weapon = weapons.find(w => w.id === weaponId) ?? weapons[0];
  if (!weapon) return null;

  const baseDmg   = weapon.base_damage ?? 0;
  const baseSpeed = weapon.attack_speed ?? 1.0;
  const attr      = weapon.primary_scaling_attr ?? 'str';

  // Build per-tier multiplier maps from tier_scaling_config
  const dmgMults: Record<number, number> = {};
  const spdMults: Record<number, number> = {};
  for (const r of tierScaling) {
    if (r.stat_key === 'base_damage')  dmgMults[r.tier] = r.multiplier;
    if (r.stat_key === 'attack_speed') spdMults[r.tier] = r.multiplier;
  }

  const statBonus  = calcStatBonus(attrLevel, statScaling);
  const gradeMult  = gradeMults[grade] ?? GRADE_MULT_DEFAULTS[grade];
  const tiers      = Array.from({ length: maxTier }, (_, i) => i + 1);

  const rows = tiers.map(t => {
    const tieredDmg   = baseDmg   * (dmgMults[t] ?? 1.0);
    const tieredSpeed = baseSpeed * (spdMults[t] ?? 1.0);

    // formula: final_damage = weapon_base_at_tier + round(stat_bonus × grade_mult)
    const fStatContrib = Math.round(statBonus * 1.0);
    const gStatContrib = Math.round(statBonus * gradeMult);
    const fDmg         = tieredDmg + fStatContrib;
    const gDmg         = tieredDmg + gStatContrib;
    return {
      tier:         t,
      tieredDmg,
      tieredSpeed,
      baseDps:      tieredDmg * tieredSpeed,
      fStatContrib, fDmg, fDps: fDmg * tieredSpeed,
      gStatContrib, gDmg, gDps: gDmg * tieredSpeed,
      gStatDps: gStatContrib * tieredSpeed,
      bonus:        gDmg - fDmg,
    };
  });

  const attrLabel = attr.toUpperCase();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <p className="text-sm font-medium text-heading">⚔️ Weapon Balance Preview</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          See how grade affects damage per tier. Formula:{' '}
          <span className="font-mono text-body">dmg = base_at_tier + round(stat_bonus × grade_mult)</span>
        </p>
      </div>

      {/* Controls */}
      <div className="px-6 py-4 border-b border-border flex flex-wrap gap-4 items-end">
        {/* Weapon picker */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Weapon</label>
          <select
            value={weaponId}
            onChange={e => setWeaponId(e.target.value)}
            className="text-sm bg-background border border-border rounded-md px-3 py-1.5 text-body focus:outline-none focus:ring-1 focus:ring-primary min-w-[180px]"
          >
            {weapons.map(w => (
              <option key={w.id} value={w.id}>{w.display_name}</option>
            ))}
          </select>
        </div>

        {/* Grade picker */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Compare Grade</label>
          <div className="flex gap-1">
            {GRADES.map(g => (
              <button
                key={g}
                onClick={() => setGrade(g)}
                className={`w-9 h-9 rounded-md border text-sm font-bold transition-all ${
                  grade === g
                    ? `${GRADE_STYLE[g]} ring-1 ring-offset-1 ring-offset-card`
                    : 'border-border text-muted-foreground hover:text-body bg-background'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Attribute level */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {attrLabel} Level <span className="normal-case font-normal text-body">(scales damage)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1} max={120} step={1}
              value={attrLevel}
              onChange={e => setAttrLevel(Number(e.target.value))}
              className="w-40 accent-primary"
            />
            <input
              type="number"
              min={1} max={999}
              value={attrLevel}
              onChange={e => setAttrLevel(Math.max(1, Number(e.target.value)))}
              className="w-16 text-sm bg-background border border-border rounded-md px-2 py-1 text-body text-center focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
            />
          </div>
        </div>

        {/* Info pill */}
        <div className="ml-auto flex items-center gap-2 pb-0.5">
          <span className="text-xs text-muted-foreground">
            Stat bonus at {attrLabel} {attrLevel}:{' '}
            <span className="font-mono text-body font-semibold">+{fmt(statBonus, 0)}</span>
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${GRADE_STYLE[grade]}`}>
            {grade} ×{(gradeMults[grade] ?? GRADE_MULT_DEFAULTS[grade]).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-12">Tier</th>
              <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Speed</th>
              <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Base DMG</th>
              <th className="text-right px-4 py-2.5 text-muted-foreground font-medium border-r border-border">Base DPS</th>
              <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">F Stats</th>
              <th className="text-right px-3 py-2.5 text-muted-foreground font-medium border-r border-border">F DPS</th>
              <th className={`text-right px-3 py-2.5 font-semibold ${GRADE_STYLE[grade].split(' ')[1]}`}>
                {grade} Stats
              </th>
              <th className={`text-right px-3 py-2.5 font-semibold border-r border-border ${GRADE_STYLE[grade].split(' ')[1]}`}>
                {grade} Stat DPS
              </th>
              <th className="text-right px-3 py-2.5 text-body font-semibold">Total DMG</th>
              <th className="text-right px-4 py-2.5 text-body font-semibold border-r border-border">Total DPS</th>
              <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Grade Bonus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const dmgDelta = ((r.gDmg - r.fDmg) / Math.max(r.fDmg, 1)) * 100;
              const dpsDelta = ((r.gDps - r.fDps) / Math.max(r.fDps, 1)) * 100;
              return (
                <tr key={r.tier} className={i % 2 === 0 ? 'bg-card' : 'bg-background'}>
                  <td className="px-4 py-2 font-mono text-muted-foreground">T{r.tier}</td>
                  <td className="px-3 py-2 text-right text-body tabular-nums">{fmt(r.tieredSpeed, 2)}</td>
                  <td className="px-3 py-2 text-right text-body tabular-nums">{fmt(r.tieredDmg)}</td>
                  <td className="px-4 py-2 text-right text-body tabular-nums border-r border-border">{fmt(r.baseDps)}</td>
                  {/* F stat contribution and F DPS */}
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">+{fmt(r.fStatContrib, 0)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums border-r border-border">{fmt(r.fDps)}</td>
                  {/* Selected grade stat contribution and DPS */}
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${GRADE_STYLE[grade].split(' ')[1]}`}>
                    +{fmt(r.gStatContrib, 0)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold border-r border-border ${GRADE_STYLE[grade].split(' ')[1]}`}>
                    {fmt(r.gStatDps)}
                  </td>
                  {/* Total = Base + Grade stats */}
                  <td className="px-3 py-2 text-right text-body tabular-nums font-semibold">{fmt(r.gDmg)}</td>
                  <td className="px-4 py-2 text-right text-body tabular-nums font-semibold border-r border-border">{fmt(r.gDps)}</td>
                  {/* Grade Bonus vs F */}
                  <td className="px-4 py-2 text-right tabular-nums">
                    <span className="text-emerald-400">+{fmt(r.bonus, 0)} dmg</span>
                    <span className="text-muted-foreground ml-1">({fmt(dpsDelta, 1)}% vs F)</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-6 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-body">F Stats / {grade} Stats</span> = the flat damage your attributes add at grade F vs {grade} (Base + Stats = Total DMG).{' '}
            <span className="font-semibold text-body">Grade Bonus %</span> = how much more DPS grade {grade} deals compared to F grade at the same tier.{' '}
            Speed shown is weapon base attack speed at that tier — DEX not included.
          </p>
      </div>
    </div>
  );
}
