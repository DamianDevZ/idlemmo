'use client';

import { useState, useCallback } from 'react';
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

// ─── Category display metadata ─────────────────────────────────────────────

type CatMeta = {
  title: string;
  icon: string;
  formula: string;
  desc: string;
};

const CAT_META: Record<string, CatMeta> = {
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
    desc: 'Derived stat formulas. Every Vigor point gives hpPerVigor HP; every Endurance point gives slotsPerEnd carry slots.',
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
      'meleeDmg  = weaponBase × (1 + STR / meleeDivisor) × skillMult\nrangedDmg = weaponBase × (1 + DEX / rangedDivisor) × skillMult\nmagicDmg  = spellBase  × (1 + INT / magicDivisor)  × skillMult\nskillMult = 1 + combatSkillLvl × combatDmgFactor\n\ndefReduction = armor / (armor + armorDivisor)   [hyperbolic, 0 → 1]\nfinalDmg     = max(1, floor(rawDmg × (1 − defReduction)))',
    desc: 'Damage formulas for all attack types. Lower divisors = more damage per attribute point. armorDivisor controls how quickly armor provides diminishing returns.',
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
      'categoryPts/tick = xpPerTick / xpPerPoint\ngatherTickMs  /= (1 + skillLevel × speedFactor)\ngatherYield   ×= (1 + skillLevel × yieldFactor)\ncraftBonus%   += skillLevel × craftSuccessBonus\nrareBonus%    += skillLevel × rareFindBonus\ncombatMult     = 1 + skillLevel × combatDmgFactor\n\nLevel cost cycle [1,1,2,2,3,3,4,5,5,6] repeats with a floor multiplier.',
    desc: 'How sub-skill levels improve performance over time. Small factors compound significantly at high skill levels.',
  },
  exploration: {
    title: 'Exploration Encounters',
    icon: '🗺️',
    formula:
      'Each tick (every tickInterval seconds):\n  P(resource) = baseResourceChance × focus.resourceMult\n  P(enemy)    = baseEnemyChance    × focus.enemyMult\n  P(treasure) = baseTreasureChance × focus.treasureMult\n\nProbabilities are independent (multiple outcomes can trigger per tick).',
    desc: 'Base probabilities for what happens on each exploration server tick. Modified by the player\'s chosen exploration focus.',
  },
  focus_mults: {
    title: 'Focus Multipliers',
    icon: '🎯',
    formula:
      'effectiveChance = baseChance × focusMultiplier[focusType][encounterType]\n\nFocus types:  resources | enemies | treasure | balanced (1.0 × all)\nEncounter types: resource | enemy | treasure',
    desc: 'How each exploration focus shifts the encounter probability mix. Balanced uses 1.0× for all types.',
  },
  combat_settings: {
    title: 'Combat Settings',
    icon: '⚡',
    formula:
      'If rounds > maxRounds → DRAW (both sides survive)\nstaminaCost deducted from attacker each round',
    desc: 'maxRounds prevents infinite fights. Stamina cost makes sustained aggressive combat progressively expensive.',
  },
  death: {
    title: 'Death Penalties',
    icon: '💀',
    formula:
      'For each inventory slot:\n  P(slot lost on death) = itemDropChance   [0 → 1]\n\nStash / bank items are always safe from death drops.',
    desc: 'Each carried slot rolls independently. 0.10 = 10% chance to lose that slot\'s contents. Stash is always protected.',
  },
  world_boss: {
    title: 'World Boss',
    icon: '👑',
    formula:
      'bossHP  = avgPlayerMaxHP × bossHpMultiplier × playerCount\nbossDmg ∝ bossDmgPerPlayer   (prevents trivial solos)\nSpawns every spawnIntervalHours per biome+tier pair.',
    desc: 'HP scales with both player strength and headcount, keeping the fight challenging for any group size.',
  },
  arena: {
    title: 'Arena (PvP)',
    icon: '🏟️',
    formula:
      'Matchmaking: | levelA − levelB | ≤ matchmakingRange\nWinner: +pointsPerWin\nLoser:  −pointsPerLoss',
    desc: 'Smaller matchmaking range = stricter skill brackets. Arena points accumulate for seasonal leaderboard rankings.',
  },
  rarities: {
    title: 'Drop Weight Multipliers',
    icon: '🎲',
    formula:
      'P(rarity) ∝ basePoolWeight × dropWeightMult\nWeights are normalised across all eligible items in the loot pool.\nCommon = 1.00 baseline — all others are relative to this.',
    desc: 'Lower weight = rarer. These multiply each item\'s individual pool weight before the final draw is made.',
  },
};

const CAT_ORDER = [
  'levelling',
  'hp_carry',
  'gathering',
  'combat_damage',
  'combat_speed_crit',
  'skills',
  'exploration',
  'focus_mults',
  'combat_settings',
  'death',
  'world_boss',
  'arena',
  'rarities',
];

// ─── Focus subgroup labels ────────────────────────────────────────────────
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

// ─── Component ────────────────────────────────────────────────────────────

export default function FormulasClient({
  initialConfig,
}: {
  initialConfig: ConfigRow[];
}) {
  // Local editable values (key → number)
  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(initialConfig.map(r => [r.key, Number(r.value)]))
  );

  // Last-saved values (to detect dirty state)
  const [savedValues, setSavedValues] = useState<Record<string, number>>(
    () => Object.fromEntries(initialConfig.map(r => [r.key, Number(r.value)]))
  );

  // Default values for reset
  const defaults = Object.fromEntries(
    initialConfig.map(r => [r.key, Number(r.default_value)])
  );

  // Per-category save state
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [flash, setFlash]   = useState<Record<string, 'saved' | 'error'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Group rows by category, sorted by sort_order
  const byCategory = CAT_ORDER.reduce<Record<string, ConfigRow[]>>((acc, cat) => {
    acc[cat] = initialConfig
      .filter(r => r.category === cat)
      .sort((a, b) => a.sort_order - b.sort_order);
    return acc;
  }, {});

  const isDirtyKey = (key: string) => values[key] !== savedValues[key];
  const isDirtyCat = (cat: string) =>
    (byCategory[cat] ?? []).some(r => isDirtyKey(r.key));

  const handleChange = useCallback((key: string, raw: string) => {
    const num = parseFloat(raw);
    setValues(prev => ({ ...prev, [key]: isNaN(num) ? prev[key] : num }));
  }, []);

  const saveCategory = async (cat: string) => {
    const rows = byCategory[cat] ?? [];
    const dirty = rows.filter(r => isDirtyKey(r.key));
    if (!dirty.length) return;

    setSaving(p => ({ ...p, [cat]: true }));
    setErrors(p => ({ ...p, [cat]: '' }));

    const updates = dirty.map(r => ({ key: r.key, value: values[r.key] }));
    const result  = await saveConfigValues(updates);

    setSaving(p => ({ ...p, [cat]: false }));

    if (result.error) {
      setErrors(p => ({ ...p, [cat]: result.error! }));
      setFlash(p => ({ ...p, [cat]: 'error' }));
    } else {
      setSavedValues(p => {
        const next = { ...p };
        updates.forEach(u => { next[u.key] = u.value; });
        return next;
      });
      setFlash(p => ({ ...p, [cat]: 'saved' }));
      setTimeout(() => setFlash(p => ({ ...p, [cat]: 'saved' })), 2000);
    }
  };

  const resetCategory = async (cat: string) => {
    const rows = byCategory[cat] ?? [];
    const keys = rows.map(r => r.key);

    setSaving(p => ({ ...p, [cat]: true }));
    setErrors(p => ({ ...p, [cat]: '' }));

    const result = await resetConfigToDefaults(keys);

    setSaving(p => ({ ...p, [cat]: false }));

    if (result.error) {
      setErrors(p => ({ ...p, [cat]: result.error! }));
    } else {
      const reset: Record<string, number> = {};
      keys.forEach(k => { reset[k] = defaults[k]; });
      setValues(p => ({ ...p, ...reset }));
      setSavedValues(p => ({ ...p, ...reset }));
      setFlash(p => ({ ...p, [cat]: 'saved' }));
    }
  };

  if (initialConfig.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
        <p className="text-amber-400 font-semibold mb-1">Database table not yet created</p>
        <p className="text-sm text-muted-foreground">
          Open <strong>Supabase Dashboard → SQL Editor</strong> and run{' '}
          <code className="bg-background px-1 rounded text-xs">supabase/migrations/014_game_config.sql</code>{' '}
          to create and seed the game_config table.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live-config notice */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span className="text-lg mt-0.5">ℹ️</span>
        <div>
          <p className="text-sm font-medium text-heading">Changes save to database</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Values persist immediately. Connect game formula functions to{' '}
            <code className="bg-background px-1 rounded">getGameConfig()</code> to make
            changes take effect in live gameplay without a redeploy.
          </p>
        </div>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {CAT_ORDER.map(cat => {
          const meta = CAT_META[cat];
          const rows = byCategory[cat] ?? [];
          if (!meta || rows.length === 0) return null;

          const dirty    = isDirtyCat(cat);
          const isSaving = saving[cat];
          const catFlash = flash[cat];
          const catError = errors[cat];

          return (
            <div
              key={cat}
              className="flex flex-col rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xl leading-none">{meta.icon}</span>
                  <h3 className="font-semibold text-heading text-sm">{meta.title}</h3>
                </div>
                {dirty && !isSaving && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    unsaved
                  </span>
                )}
                {catFlash === 'saved' && !dirty && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    ✓ saved
                  </span>
                )}
              </div>

              {/* Formula block */}
              <div className="px-5 pt-4">
                <pre className="text-[11px] leading-relaxed font-mono bg-background border border-border rounded-lg px-3.5 py-3 text-muted-foreground overflow-x-auto whitespace-pre">
                  {meta.formula}
                </pre>
                <p className="text-[11px] text-muted-foreground mt-2 mb-3 leading-relaxed">
                  {meta.desc}
                </p>
              </div>

              {/* Fields */}
              <div className="px-5 pb-4 flex-1 space-y-1">
                <FocusGroupRows cat={cat} rows={rows} values={values} savedValues={savedValues} onChange={handleChange} />
              </div>

              {/* Error */}
              {catError && (
                <div className="mx-5 mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  {catError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background/20">
                <button
                  onClick={() => resetCategory(cat)}
                  disabled={isSaving}
                  className="text-xs text-muted-foreground hover:text-body transition-colors disabled:opacity-40"
                >
                  Reset to defaults
                </button>
                <button
                  onClick={() => saveCategory(cat)}
                  disabled={!dirty || !!isSaving}
                  className="text-xs px-3.5 py-1.5 rounded-md font-medium bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Rows renderer (handles focus_mults subgroup headers) ─────────────────

function FocusGroupRows({
  cat,
  rows,
  values,
  savedValues,
  onChange,
}: {
  cat: string;
  rows: ConfigRow[];
  values: Record<string, number>;
  savedValues: Record<string, number>;
  onChange: (key: string, raw: string) => void;
}) {
  if (cat !== 'focus_mults') {
    return (
      <>
        {rows.map(row => (
          <FieldRow key={row.key} row={row} value={values[row.key]} savedValue={savedValues[row.key]} onChange={onChange} />
        ))}
      </>
    );
  }

  // Group focus_mults rows into sub-sections
  let lastGroup = '';
  return (
    <>
      {rows.map(row => {
        const group = FOCUS_GROUPS[row.key] ?? '';
        const showHeader = group !== lastGroup;
        lastGroup = group;
        return (
          <div key={row.key}>
            {showHeader && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pt-2 pb-1">
                {group}
              </p>
            )}
            <FieldRow row={row} value={values[row.key]} savedValue={savedValues[row.key]} onChange={onChange} />
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
    <div className="flex items-start gap-3 py-1.5 border-b border-border/40 last:border-0">
      {/* Label + description */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs font-medium text-foreground leading-snug">{row.label}</p>
        {row.description && (
          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{row.description}</p>
        )}
      </div>

      {/* Input + unit */}
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={value}
          step={row.step}
          min={row.min_value ?? undefined}
          max={row.max_value ?? undefined}
          onChange={e => onChange(row.key, e.target.value)}
          className={[
            'w-24 text-right text-xs px-2 py-1.5 rounded-md border bg-background',
            'focus:outline-none focus:ring-1 focus:ring-primary transition-colors',
            dirty
              ? 'border-amber-500/60 text-amber-300'
              : 'border-border text-foreground',
          ].join(' ')}
        />
        {row.unit ? (
          <span className="text-[10px] text-muted-foreground w-10 shrink-0">{row.unit}</span>
        ) : (
          <span className="w-10 shrink-0" />
        )}
      </div>
    </div>
  );
}
