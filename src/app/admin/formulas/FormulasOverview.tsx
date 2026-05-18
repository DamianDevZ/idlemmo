import Link from 'next/link';
import type { ConfigRow } from './CategoryDetail';

// ─── Category card metadata ───────────────────────────────────────────────

const CAT_META: Record<string, { title: string; icon: string; desc: string; snippet: string }> = {
  levelling: {
    title: 'Levelling & XP',
    icon: '⭐',
    desc: 'XP curve, scaling factor, skill points per level, and starting stats.',
    snippet: 'xpRequired(n) = xpBase × xpScaling^(n−1)',
  },
  hp_carry: {
    title: 'HP & Carry Slots',
    icon: '❤️',
    desc: 'How Vigor, Endurance, and Faith translate into HP, inventory, and regen.',
    snippet: 'maxHP = baseHp + vigor × hpPerVigor',
  },
  gathering: {
    title: 'Attribute → Gathering',
    icon: '⛏️',
    desc: 'DEX speed, STR yield, INT refine, Faith craft%, Arcane rare% per attribute point.',
    snippet: 'tickMs = base / (1 + DEX × factor)',
  },
  combat_damage: {
    title: 'Combat — Damage',
    icon: '⚔️',
    desc: 'Melee, ranged, and magic damage formulas plus armour damage reduction.',
    snippet: 'dmg = base × (1 + ATTR / divisor) × skillMult',
  },
  combat_speed_crit: {
    title: 'Combat — Speed & Crits',
    icon: '💥',
    desc: 'Attack speed divisor and critical hit chance/damage formulas.',
    snippet: 'critChance% = weaponCrit + DEX × critFactor',
  },
  skills: {
    title: 'Skill System',
    icon: '📈',
    desc: 'XP per tick, category point conversion, and per-level bonuses for speed, yield, crits.',
    snippet: 'tickMs /= (1 + skillLevel × speedFactor)',
  },
  exploration: {
    title: 'Exploration Encounters',
    icon: '🗺️',
    desc: 'Tick rate and base probabilities for resource, enemy, and treasure encounters.',
    snippet: 'P(resource) = baseChance × focus.resourceMult',
  },
  focus_mults: {
    title: 'Focus Multipliers',
    icon: '🎯',
    desc: 'How each exploration focus type scales the three encounter chance categories.',
    snippet: 'effectiveChance = baseChance × focusMult[focus][type]',
  },
  combat_settings: {
    title: 'Combat Settings',
    icon: '⚡',
    desc: 'Max round limit before a draw is declared, and stamina cost per round.',
    snippet: 'draw if rounds > maxRounds',
  },
  death: {
    title: 'Death Penalties',
    icon: '💀',
    desc: 'Per-slot probability that carried items are lost on death. Stash is always safe.',
    snippet: 'P(item lost) = itemDropChance  per slot',
  },
  world_boss: {
    title: 'World Boss',
    icon: '👑',
    desc: 'Spawn schedule, queue window, player limits, and HP/damage scaling formulas.',
    snippet: 'bossHP = avgPlayerHP × mult × playerCount',
  },
  arena: {
    title: 'Arena (PvP)',
    icon: '🏟️',
    desc: 'Matchmaking level bracket and arena point rewards for wins and losses.',
    snippet: '|levelA − levelB| ≤ matchmakingRange',
  },
  rarities: {
    title: 'Drop Weight Multipliers',
    icon: '🎲',
    desc: 'Relative drop probability per item. Weights are normalised before the final draw.',
    snippet: 'weight ∝ drop probability (normalised)',
  },
};

const CAT_ORDER = [
  'levelling', 'hp_carry', 'gathering',
  'combat_damage', 'combat_speed_crit', 'skills',
  'exploration', 'focus_mults', 'combat_settings',
  'death', 'world_boss', 'arena', 'rarities',
];

// ─── Component ───────────────────────────────────────────────────────────

export default function FormulasOverview({ config }: { config: ConfigRow[] }) {
  const countByCategory = config.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  if (config.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
        <p className="text-amber-400 font-semibold mb-1">game_config table not found</p>
        <p className="text-sm text-muted-foreground">
          Run <code className="bg-background px-1 rounded text-xs">supabase/migrations/014_game_config.sql</code> via the Supabase SQL Editor.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {CAT_ORDER.map(cat => {
        const meta = CAT_META[cat];
        if (!meta) return null;
        const count = countByCategory[cat] ?? 0;

        return (
          <Link
            key={cat}
            href={`/admin/formulas?category=${cat}`}
            className="group flex flex-col rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-colors overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl leading-none">{meta.icon}</span>
                <span className="font-semibold text-heading text-sm">{meta.title}</span>
              </div>
              <span className="text-xs text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
                {count} settings
              </span>
            </div>

            {/* Body */}
            <div className="px-5 py-4 flex-1 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground leading-relaxed">{meta.desc}</p>
              <pre className="text-[11px] font-mono bg-background border border-border rounded-md px-3 py-2 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                {meta.snippet}
              </pre>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">View &amp; edit →</span>
              <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                Open
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
