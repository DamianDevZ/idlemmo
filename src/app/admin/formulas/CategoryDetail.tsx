'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveConfigValues, resetConfigToDefaults } from './actions';

export type ConfigRow = {
  id: string;
  category: string;
  sort_order: number;
  key: string;
  label: string;
  description: string | null;
  value: number;
  default_value: number;
  min_value: number | null;
  max_value: number | null;
  step: number;
  unit: string | null;
  updated_at: string;
};

// ─── Per-category metadata ────────────────────────────────────────────────

const CAT_META: Record<string, { title: string; icon: string; formula: string; desc: string }> = {
  levelling: {
    title: 'Levelling & XP',
    icon: '⭐',
    formula:
      'xpRequired(n) = floor( xpBase × xpScaling^(n−1) )\ncumXP(n)     = Σ xpRequired(i) for i = 1..n',
    desc: 'Controls the XP cost per main level and how steeply it scales with progression.',
  },
  hp_carry: {
    title: 'HP & Carry Slots',
    icon: '❤️',
    formula:
      'maxHP       = baseHp + vigor × hpPerVigor\ncarrySlots  = baseSlots + endurance × slotsPerEnd\nhpRegen/min = faith × hpRegenPerFaith   (out-of-combat only)',
    desc: 'Every Vigor point gives hpPerVigor HP; every Endurance point gives slotsPerEnd carry slots.',
  },
  gathering: {
    title: 'Attribute → Gathering',
    icon: '⛏️',
    formula:
      'gatherTickMs = base / (1 + DEX × dexGatherSpeed)\ngatherYield  = base × (1 + STR × strGatherYield)\nrefineOutput = base × (1 + INT × intRefineFactor)\ncraftBonus%  += FAITH  × faithCraftBonus\nrareChance%  += ARCANE × arcaneRareFactor',
    desc: 'How each attribute scales gathering speed, yield, refining efficiency, crafting success, and rare drop rates.',
  },
  combat_damage: {
    title: 'Combat — Damage',
    icon: '⚔️',
    formula:
      'Each weapon has a Base Damage and a Scaling Attribute (STR, DEX, or INT) — set per-weapon in the Items admin.\n\nFinal hit = weaponBase × (1 + your attribute / divisor)\nSmaller divisor → that attribute adds more damage per point.\n\nArmor uses a curve that never reaches 100%, so more armor always helps.',
    desc: 'These divisors control how much STR, DEX, and INT amplify weapons that scale off each stat. Assign the scaling attribute on each weapon in the Items admin.',
  },
  combat_speed_crit: {
    title: 'Combat — Speed & Crits',
    icon: '💥',
    formula:
      'attackSpeed = weaponBaseSpeed × (1 + DEX / speedDivisor)\ncritChance% = weaponCritBonus + DEX × critFactor   [capped at 100]\ncritMult    = critDmgBase    + DEX × critDmgFactor',
    desc: 'Higher DEX = faster swings and higher crit chance. critDmgBase is the guaranteed multiplier even at 0 DEX.',
  },
  skills: {
    title: 'Skill System',
    icon: '📈',
    formula:
      'categoryPts/tick = xpPerTick / xpPerPoint\ngatherTickMs  /= (1 + skillLevel × speedFactor)\ngatherYield   ×= (1 + skillLevel × yieldFactor)\ncraftBonus%   += skillLevel × craftSuccessBonus\nrareBonus%    += skillLevel × rareFindBonus\ncombatMult     = 1 + skillLevel × combatDmgFactor\n\nLevel cost cycle: [1,1,2,2,3,3,4,5,5,6] repeating.',
    desc: 'How sub-skill levels improve performance over time. Small factors compound significantly at high skill levels.',
  },
  exploration: {
    title: 'Exploration Encounters',
    icon: '🗺️',
    formula:
      'Each tick (every tickInterval seconds):\n  P(resource) = baseResourceChance × focus.resourceMult\n  P(enemy)    = baseEnemyChance    × focus.enemyMult\n  P(treasure) = baseTreasureChance × focus.treasureMult\n\nProbabilities are independent per tick.',
    desc: 'Base encounter probabilities each server tick. Modified by the player\'s chosen exploration focus.',
  },
  focus_mults: {
    title: 'Focus Multipliers',
    icon: '🎯',
    formula:
      'effectiveChance = baseChance × focusMultiplier[focusType][encounterType]\n\nFocus types:     resources | enemies | treasure | balanced (1.0×)\nEncounter types: resource  | enemy   | treasure',
    desc: 'How each exploration focus shifts the encounter mix. Balanced focus uses 1.0× for all types.',
  },
  combat_settings: {
    title: 'Combat Settings',
    icon: '⚡',
    formula:
      'If rounds > maxRounds → DRAW (both sides survive)\nstaminaCost deducted from attacker each round',
    desc: 'maxRounds prevents infinite fights. Stamina cost makes prolonged aggressive combat expensive.',
  },
  death: {
    title: 'Death Penalties',
    icon: '💀',
    formula:
      'For each inventory slot:\n  P(slot lost on death) = itemDropChance   [0 → 1]\n\nStash / bank items are always protected.',
    desc: 'Each carried slot rolls independently. 0.10 = 10% chance per slot. Stash is always safe.',
  },
  world_boss: {
    title: 'World Boss',
    icon: '👑',
    formula:
      'bossHP  = avgPlayerMaxHP × bossHpMultiplier × playerCount\nbossDmg ∝ bossDmgPerPlayer   (prevents trivial solos)\nSpawns every spawnIntervalHours per biome+tier.',
    desc: 'Boss HP scales with both player strength and group size, keeping fights challenging for any headcount.',
  },
  arena: {
    title: 'Arena (PvP)',
    icon: '🏟️',
    formula:
      'Matchmaking: | levelA − levelB | ≤ matchmakingRange\nWinner: +pointsPerWin\nLoser:  −pointsPerLoss',
    desc: 'Smaller matchmaking range = stricter skill brackets. Points accumulate for seasonal leaderboard rankings.',
  },
  rarities: {
    title: 'Drop Weight Multipliers',
    icon: '🎲',
    formula:
      'P(rarity) ∝ basePoolWeight × dropWeightMult\nWeights normalised across all eligible items in the loot pool.\nCommon = 1.00 baseline.',
    desc: 'Lower weight = rarer. These multiply each item\'s base pool weight before the final draw.',
  },
};

const FOCUS_GROUPS: Record<string, string> = {
  focus_res_resource:      'Resources Focus',
  focus_res_enemy:         'Resources Focus',
  focus_res_treasure:      'Resources Focus',
  focus_enemy_resource:    'Enemies Focus',
  focus_enemy_enemy:       'Enemies Focus',
  focus_enemy_treasure:    'Enemies Focus',
  focus_treasure_resource: 'Treasure Focus',
  focus_treasure_enemy:    'Treasure Focus',
  focus_treasure_treasure: 'Treasure Focus',
};

// ─── Component ───────────────────────────────────────────────────────────

export default function CategoryDetail({
  rows,
  category,
}: {
  rows: ConfigRow[];
  category: string;
}) {
  const router = useRouter();
  const meta = CAT_META[category];

  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(rows.map(r => [r.key, Number(r.value)]))
  );
  const [savedValues, setSavedValues] = useState<Record<string, number>>(
    () => Object.fromEntries(rows.map(r => [r.key, Number(r.value)]))
  );
  const defaults = Object.fromEntries(rows.map(r => [r.key, Number(r.default_value)]));

  const [saving, setSaving]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [flash, setFlash]     = useState<'saved' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const isDirtyKey = (key: string) => values[key] !== savedValues[key];
  const anyDirty   = sorted.some(r => isDirtyKey(r.key));

  const handleChange = useCallback((key: string, raw: string) => {
    const num = parseFloat(raw);
    setValues(prev => ({ ...prev, [key]: isNaN(num) ? prev[key] : num }));
    setFlash(null);
  }, []);

  const handleSave = async () => {
    const dirty = sorted.filter(r => isDirtyKey(r.key));
    if (!dirty.length) return;

    setSaving(true);
    setErrorMsg('');

    const result = await saveConfigValues(dirty.map(r => ({ key: r.key, value: values[r.key] })));

    setSaving(false);
    if (result.error) {
      setErrorMsg(result.error);
      setFlash('error');
    } else {
      setSavedValues(prev => {
        const next = { ...prev };
        dirty.forEach(r => { next[r.key] = values[r.key]; });
        return next;
      });
      setFlash('saved');
      router.refresh();
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setErrorMsg('');

    const result = await resetConfigToDefaults(sorted.map(r => r.key));

    setResetting(false);
    if (result.error) {
      setErrorMsg(result.error);
    } else {
      const reset = Object.fromEntries(sorted.map(r => [r.key, defaults[r.key]]));
      setValues(reset);
      setSavedValues(reset);
      setFlash('saved');
      router.refresh();
    }
  };

  if (!meta) {
    return <p className="text-muted-foreground text-sm">Unknown category: {category}</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">{meta.icon}</span>
          <div>
            <h2 className="font-bold text-heading text-lg leading-tight">{meta.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{sorted.length} settings</p>
          </div>
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

      {/* How it works */}
      <div className="px-6 pt-5 pb-2">
        <div className="rounded-lg bg-background border border-border px-4 py-3.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">How it works</p>
          <p className="text-sm text-body leading-relaxed whitespace-pre-line">{meta.formula}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{meta.desc}</p>
      </div>

      {/* Fields */}
      <div className="px-6 py-4 space-y-0.5">
        <FieldList category={category} rows={sorted} values={values} savedValues={savedValues} onChange={handleChange} />
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
          disabled={resetting || saving}
          className="text-xs text-muted-foreground hover:text-body transition-colors disabled:opacity-40"
        >
          {resetting ? 'Resetting…' : 'Reset all to defaults'}
        </button>
        <button
          onClick={handleSave}
          disabled={!anyDirty || saving || resetting}
          className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Field list (handles focus_mults sub-group headers) ───────────────────

function FieldList({
  category,
  rows,
  values,
  savedValues,
  onChange,
}: {
  category: string;
  rows: ConfigRow[];
  values: Record<string, number>;
  savedValues: Record<string, number>;
  onChange: (key: string, raw: string) => void;
}) {
  if (category !== 'focus_mults') {
    return (
      <>
        {rows.map(r => (
          <FieldRow key={r.key} row={r} value={values[r.key]} savedValue={savedValues[r.key]} onChange={onChange} />
        ))}
      </>
    );
  }

  let lastGroup = '';
  return (
    <>
      {rows.map(r => {
        const group = FOCUS_GROUPS[r.key] ?? '';
        const showHeader = group !== lastGroup;
        lastGroup = group;
        return (
          <div key={r.key}>
            {showHeader && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pt-4 pb-1">
                {group}
              </p>
            )}
            <FieldRow row={r} value={values[r.key]} savedValue={savedValues[r.key]} onChange={onChange} />
          </div>
        );
      })}
    </>
  );
}

// ─── Single field row ─────────────────────────────────────────────────────

function FieldRow({
  row,
  value,
  savedValue,
  onChange,
}: {
  row: ConfigRow;
  value: number;
  savedValue: number;
  onChange: (key: string, raw: string) => void;
}) {
  const dirty = value !== savedValue;

  return (
    <div className="flex items-start gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{row.label}</p>
        {row.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{row.description}</p>
        )}
        {dirty && (
          <p className="text-[10px] text-amber-400/80 mt-0.5">
            was {savedValue}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        <input
          type="number"
          value={value}
          step={row.step}
          min={row.min_value ?? undefined}
          max={row.max_value ?? undefined}
          onChange={e => onChange(row.key, e.target.value)}
          className={[
            'w-28 text-right text-sm px-3 py-1.5 rounded-md border bg-background',
            'focus:outline-none focus:ring-1 focus:ring-primary transition-colors',
            dirty
              ? 'border-amber-500/60 text-amber-300'
              : 'border-border text-foreground',
          ].join(' ')}
        />
        <span className="text-xs text-muted-foreground w-12 shrink-0">
          {row.unit ?? ''}
        </span>
      </div>
    </div>
  );
}
