'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveConfigValues, resetConfigToDefaults } from './actions';

// ─── Types ────────────────────────────────────────────────────────────────

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

// ─── Category metadata ────────────────────────────────────────────────────

const CAT_ORDER = [
  'levelling', 'hp_carry', 'gathering',
  'combat_damage', 'combat_speed_crit', 'skills',
  'exploration', 'focus_mults', 'combat_settings',
  'death', 'world_boss', 'arena', 'rarities',
];

const CAT_META: Record<string, { title: string; icon: string; formula: string; desc: string }> = {
  levelling: {
    title: 'Levelling & XP',
    icon: '⭐',
    formula: 'xpRequired(n) = floor( xpBase × xpScaling^(n−1) )',
    desc: 'Controls how steeply XP costs ramp up. xpBase is what level 1→2 costs; every subsequent level multiplies by xpScaling. A small change to xpScaling compounds dramatically at higher levels.',
  },
  hp_carry: {
    title: 'HP & Carry Slots',
    icon: '❤️',
    formula: 'maxHP       = baseHp + vigor × hpPerVigor\ncarrySlots  = baseSlots + endurance × slotsPerEnd\nhpRegen/min = faith × hpRegenPerFaith  (out of combat)',
    desc: 'Translates Vigor, Endurance, and Faith attribute points into tangible stat gains. These numbers determine how meaningful investing in survivability feels.',
  },
  gathering: {
    title: 'Attribute → Gathering',
    icon: '⛏️',
    formula: 'tickMs      = base / (1 + DEX × dexGatherSpeed)\nyield       = base × (1 + STR × strGatherYield)\noutput      = base × (1 + INT × intRefineFactor)\ncraft%     += FAITH  × faithCraftBonus\nrareChance% += ARCANE × arcaneRareFactor',
    desc: 'How each attribute scales the five dimensions of gathering: speed, yield, refine efficiency, craft success, and rare drop rate.',
  },
  combat_damage: {
    title: 'Combat — Damage',
    icon: '⚔️',
    formula: 'damage    = weaponBase × (1 + scalingAttr / divisor) × skillMult\nreduction = armor / (armor + armorDivisor)  [hyperbolic, never hits 100%]\n\nEach weapon has its own Scaling Attribute (STR / DEX / INT), set in the Items admin.\nThe matching divisor below controls how much that attribute boosts damage.',
    desc: 'Lower divisor = each attribute point adds more damage. Armor divisor uses a curve that never reaches 100%, so armor always helps but never makes you invincible.',
  },
  combat_speed_crit: {
    title: 'Combat — Speed & Crits',
    icon: '💥',
    formula: 'attackSpeed = weaponBase × (1 + DEX / speedDivisor)\ncritChance% = weaponCrit + DEX × critFactor\ncritMult    = critDmgBase + DEX × critDmgFactor',
    desc: 'DEX controls attack speed and crit rate/damage. critDmgBase is the multiplier even at 0 DEX — the guaranteed floor before attribute scaling applies.',
  },
  skills: {
    title: 'Skill System',
    icon: '📈',
    formula: 'categoryPts/tick = xpPerTick / xpPerPoint\ngatherTickMs /= (1 + skillLevel × speedFactor)\ngatherYield  *= (1 + skillLevel × yieldFactor)\ncombatMult    = 1 + skillLevel × combatDamageFactor',
    desc: 'Sub-skill levels incrementally improve performance. These factors control how impactful skill investment is compared to raw attribute investment.',
  },
  exploration: {
    title: 'Exploration Encounters',
    icon: '🗺️',
    formula: 'Each tick (every tickInterval seconds):\n  P(resource) = baseResourceChance × focus.resourceMult\n  P(enemy)    = baseEnemyChance    × focus.enemyMult\n  P(treasure) = baseTreasureChance × focus.treasureMult',
    desc: 'Base encounter probabilities per server tick. Each probability rolls independently, so multiple events can happen in the same tick. Modified by the player\'s chosen exploration focus.',
  },
  focus_mults: {
    title: 'Focus Multipliers',
    icon: '🎯',
    formula: 'effectiveChance = baseChance × multiplier[focusType][encounterType]',
    desc: 'How each exploration focus shifts the mix of resource, enemy, and treasure encounters. Balanced focus always uses 1.0× for all types and is not stored in the DB.',
  },
  combat_settings: {
    title: 'Combat Settings',
    icon: '⚡',
    formula: 'draw if rounds > maxRounds\nstaminaCost applied to attacker each round',
    desc: 'maxRounds prevents fights from going on indefinitely — both sides survive a draw. Stamina cost makes prolonged aggressive combat expensive.',
  },
  death: {
    title: 'Death Penalties',
    icon: '💀',
    formula: 'For each carried inventory slot:\n  P(lost on death) = itemDropChance',
    desc: 'Each slot rolls the drop chance independently. Stash and bank items are always safe regardless of this value.',
  },
  world_boss: {
    title: 'World Boss',
    icon: '👑',
    formula: 'bossHP  = avgPlayerMaxHP × bossHpMultiplier × playerCount\nbossDmg ∝ bossDamagePerPlayer × playerCount',
    desc: 'Boss HP and damage scale with participant count to keep fights challenging regardless of group size.',
  },
  arena: {
    title: 'Arena (PvP)',
    icon: '🏟️',
    formula: 'match if |levelA − levelB| ≤ matchmakingRange\nwinner: +pointsPerWin\nloser:  −pointsPerLoss',
    desc: 'Matchmaking range determines how strictly players are paired by level. Points accumulate for seasonal leaderboard rankings.',
  },
  rarities: {
    title: 'Drop Weight Multipliers',
    icon: '🎲',
    formula: 'P(rarity) ∝ basePoolWeight × dropWeightMult\n— weights are normalised across all items in the loot pool',
    desc: 'Each rarity\'s weight is relative to the others. Common = 1.0 baseline. All weights are normalised before the final draw, so only the ratios between values matter.',
  },
};

// ─── Focus group labels ───────────────────────────────────────────────────

const FOCUS_GROUPS: Record<string, string> = {
  focus_res_resource: 'Resources Focus',
  focus_res_enemy: 'Resources Focus',
  focus_res_treasure: 'Resources Focus',
  focus_enemy_resource: 'Enemies Focus',
  focus_enemy_enemy: 'Enemies Focus',
  focus_enemy_treasure: 'Enemies Focus',
  focus_treasure_resource: 'Treasure Focus',
  focus_treasure_enemy: 'Treasure Focus',
  focus_treasure_treasure: 'Treasure Focus',
};

// ─── Per-field example text (computed live from current input value) ───────

const FIELD_EXAMPLES: Record<string, (v: number) => string> = {
  // Levelling
  xp_base: v =>
    `Level 1→2 costs exactly ${v} XP. Level 5→6 costs ${Math.floor(v * Math.pow(1.15, 4))} XP (with default 1.15× scaling). This is the floor — every level costs at least this much before the scaling multiplier applies.`,
  xp_scaling: v =>
    `At ${v}×, each level costs ${((v - 1) * 100).toFixed(0)}% more than the previous. Using the default 100 base XP: level 5 costs ${Math.floor(100 * Math.pow(v, 4))} XP, level 10 costs ${Math.floor(100 * Math.pow(v, 9)).toLocaleString()} XP, level 20 costs ${Math.floor(100 * Math.pow(v, 19)).toLocaleString()} XP. Even a 0.01 difference here has a massive endgame impact.`,
  skill_points_per_level: v =>
    `Every level-up awards ${v} attribute point${v === 1 ? '' : 's'} to spend on STR, DEX, INT, Vigor, etc. Over 50 levels a player earns ${v * 50} total points from levelling alone.`,
  starting_attribute: v =>
    `Brand-new characters start with ${v} in every stat before distributing creation bonus points. A higher floor reduces the "feel weak" frustration in the first few minutes.`,
  creation_bonus_points: v =>
    `At character creation, players freely distribute ${v} extra points. A min-maxer can immediately push one attribute to ${5 + v} (with default starting value of 5), letting them feel their build archetype from day one.`,

  // HP & Carry
  base_hp: v =>
    `Every character has at least ${v} HP, even with 0 Vigor. With the default 15 HP/Vigor: at 10 Vigor that is ${v + 150} total HP; at 20 Vigor it is ${v + 300} HP.`,
  hp_per_vigor: v =>
    `Each Vigor point adds ${v} HP. 10 Vigor = +${v * 10} HP. 20 Vigor = +${v * 20} HP. A character capped at 99 Vigor has ${v * 99} bonus HP from Vigor alone, on top of the base.`,
  base_carry_slots: v =>
    `Every player starts with ${v} inventory slots, regardless of Endurance. Raising this helps casual players who don't focus on carry stats keep up with active ones.`,
  slots_per_endurance: v =>
    `Each Endurance point gives ${v} extra slot${v === 1 ? '' : 's'}. At 10 Endurance: +${v * 10} slots (${20 + v * 10} total with the default 20-slot base). Setting this to 0 removes carry as a reason to invest in Endurance.`,
  hp_regen_per_faith: v =>
    `Out of combat, every Faith point regenerates ${v} HP per minute. A character with 20 Faith heals ${(v * 20).toFixed(1)} HP/min passively. Setting to 0 removes out-of-combat healing from Faith entirely.`,
  max_attribute: v =>
    `Players cannot invest beyond ${v} in any single attribute. A fully stacked Vigor build capped at ${v} has base_hp + ${v}×hp_per_vigor — about ${50 + v * 15} HP with all default values.`,

  // Gathering
  dex_gather_speed: v =>
    `tickMs = base / (1 + DEX × ${v}). At 10 DEX: ${(1 / (1 + 10 * v)).toFixed(3)}× tick time (${((1 - 1 / (1 + 10 * v)) * 100).toFixed(1)}% faster). At 20 DEX: ${(1 / (1 + 20 * v)).toFixed(3)}× tick time. Raising this makes DEX feel very impactful for gatherers.`,
  str_gather_yield: v =>
    `yield = base × (1 + STR × ${v}). At 10 STR: ${(1 + 10 * v).toFixed(2)}× items per tick. A miner who collects 10 ore at 0 STR gets ${((1 + 20 * v) * 10).toFixed(0)} ore at 20 STR.`,
  int_refine_factor: v =>
    `output = base × (1 + INT × ${v}). At 10 INT: ${(1 + 10 * v).toFixed(2)}× refine output. A 10-unit refine job at 20 INT yields ${((1 + 20 * v) * 10).toFixed(0)} units instead of 10.`,
  faith_craft_bonus: v =>
    `craftSuccess% += Faith × ${v}. A player with 10 Faith gets +${(10 * v).toFixed(1)}% craft success. If a recipe has a 60% base success rate, 10 Faith raises it to ${Math.min(100, 60 + 10 * v).toFixed(1)}%.`,
  arcane_rare_factor: v =>
    `rareChance% += Arcane × ${v}. At 10 Arcane: +${(10 * v).toFixed(1)}% rare quality drops. At 20 Arcane: +${(20 * v).toFixed(1)}%. Stacks additively with skill-level rare bonuses.`,

  // Combat — Damage
  str_scaling_divisor: v =>
    `STR-scaling weapons deal: weaponBase × (1 + STR / ${v}). At 20 STR: ×${(1 + 20 / v).toFixed(2)} multiplier. A sword with 50 base damage deals ${Math.round(50 * (1 + 20 / v))} at 20 STR. Halving this divisor roughly doubles the STR bonus. Set a weapon's Scaling Attribute to STR in the Items admin to use this.`,
  dex_scaling_divisor: v =>
    `DEX-scaling weapons deal: weaponBase × (1 + DEX / ${v}). At 20 DEX: ×${(1 + 20 / v).toFixed(2)} multiplier. A dagger with 40 base damage hits for ${Math.round(40 * (1 + 20 / v))} at 20 DEX. Assign DEX scaling to any weapon in the Items admin.`,
  int_scaling_divisor: v =>
    `INT-scaling weapons deal: weaponBase × (1 + INT / ${v}). At 20 INT: ×${(1 + 20 / v).toFixed(2)} multiplier. A staff with 60 base damage deals ${Math.round(60 * (1 + 20 / v))} at 20 INT. Assign INT scaling to staves or spellcasting weapons in the Items admin.`,
  armor_divisor: v =>
    `reduction = armor / (armor + ${v}). At 50 armor: ${(50 / (50 + v) * 100).toFixed(1)}% damage reduction. At 100 armor: ${(100 / (100 + v) * 100).toFixed(1)}%. This curve is hyperbolic — armor never reaches 100%. Lowering this number makes armor feel much stronger.`,

  // Combat — Speed & Crits
  dex_speed_divisor: v =>
    `speed = weaponBase × (1 + DEX / ${v}). At 10 DEX: ×${(1 + 10 / v).toFixed(2)} speed. At 20 DEX: ×${(1 + 20 / v).toFixed(2)} speed. Lower divisor = attacks land noticeably faster with each DEX point.`,
  dex_crit_factor: v =>
    `critChance% = weaponCritBonus + DEX × ${v}. With a weapon at 5% crit and 20 DEX: ${(5 + 20 * v).toFixed(1)}% total crit chance. With 40 DEX: ${(5 + 40 * v).toFixed(1)}%. Raise this to make DEX-heavy builds feel crit-focused.`,
  crit_damage_base: v =>
    `Even with 0 DEX, crits deal ${v}× damage. A hit that would do 100 damage crits for ${(v * 100).toFixed(0)}. This is the guaranteed floor — DEX investment adds further on top via dex_crit_damage_factor.`,
  dex_crit_damage_factor: v =>
    `critMult += DEX × ${v}. At 20 DEX: ${(1.5 + 20 * v).toFixed(3)}× crit multiplier (with default 1.5 base). At 60 DEX: ${(1.5 + 60 * v).toFixed(3)}×. A small value here means you need a lot of DEX to meaningfully exceed the base multiplier.`,

  // Skills
  category_xp_per_tick: v =>
    `Every time a gathering or combat action fires, ${v} XP enters the category pool. Doubling this halves the time to level any sub-skill. Use this to tune skill progression speed relative to attribute levelling.`,
  category_xp_per_point: v =>
    `It takes ${v} category XP to unlock 1 spendable skill point. At the default 10 XP/tick, that is ${Math.ceil(v / 10)} ticks per point. Raising this slows the skill economy; lowering it speeds things up.`,
  speed_factor: v =>
    `tickMs /= (1 + skillLevel × ${v}). At skill level 10: ${(1 / (1 + 10 * v)).toFixed(3)}× tick time (${((1 - 1 / (1 + 10 * v)) * 100).toFixed(1)}% faster). At level 20: ${(1 / (1 + 20 * v)).toFixed(3)}× tick time. Raising this makes skill investment feel very rewarding for speed-focused players.`,
  yield_factor: v =>
    `yield *= (1 + skillLevel × ${v}). At skill level 10: ${(1 + 10 * v).toFixed(2)}× per tick. At level 20: ${(1 + 20 * v).toFixed(2)}×. A level-20 gatherer brings home ${((1 + 20 * v) * 100 - 100).toFixed(0)}% more materials than a level-0 one doing the same activity.`,
  craft_success_bonus: v =>
    `success% += skillLevel × ${v}. At skill level 5: +${(5 * v).toFixed(1)}%. At level 10: +${(10 * v).toFixed(1)}%. A recipe with 60% base success becomes ${Math.min(100, 60 + 10 * v).toFixed(0)}% at skill level 10 — a real quality-of-life improvement for dedicated crafters.`,
  rare_find_bonus: v =>
    `rareChance% += skillLevel × ${v}. At skill level 10: +${(10 * v).toFixed(2)}%. At level 20: +${(20 * v).toFixed(2)}%. Stacks with the Arcane attribute bonus, so high-skill, high-Arcane players get noticeably better loot.`,
  combat_damage_factor: v =>
    `combatMult = 1 + skillLevel × ${v}. At combat skill level 10: ×${(1 + 10 * v).toFixed(2)} all damage. At level 20: ×${(1 + 20 * v).toFixed(2)}. This rewards players who invest heavily in the Combat skill tree over time.`,
  max_skill_level: v =>
    `Sub-skills cannot go beyond level ${v}. At this cap with the default speed_factor of 0.04: ${(1 / (1 + v * 0.04)).toFixed(3)}× tick time. Once reached, no further investment is possible in that skill branch.`,

  // Exploration
  tick_interval: v =>
    `The exploration loop fires every ${v} second${v === 1 ? '' : 's'}. With a 70% resource chance, a player finds something roughly every ${(v / 0.70).toFixed(1)}s on average. Shorter tick = faster-paced world, but more server load per player.`,
  base_resource_chance: v =>
    `${(v * 100).toFixed(0)}% base chance each tick of finding a resource node, before focus multipliers apply. Resources Focus boosts this to ~${(v * 1.5 * 100).toFixed(0)}%. Over 10 ticks, expect ~${(v * 10).toFixed(1)} resource encounters on average.`,
  base_enemy_chance: v =>
    `${(v * 100).toFixed(0)}% base chance each tick of encountering an enemy. Enemies Focus boosts this to ~${(v * 2.0 * 100).toFixed(0)}%. Lowering this creates a more peaceful default exploration experience.`,
  base_treasure_chance: v =>
    `${(v * 100).toFixed(0)}% base chance per tick. Treasure Focus boosts this to ~${(v * 2.0 * 100).toFixed(1)}%. Keep this rare — scarcity makes treasure finds feel exciting and worth specialising for.`,
  player_encounter_chance: v =>
    `${(v * 100).toFixed(0)}% chance each tick of crossing another player in the same biome+tier. Both players get a notification. Keep this low to avoid overwhelming pop-ups in busy zones.`,
  collect_prompt_timeout: v =>
    `After a find, the player has ${v}s to choose an action before the game auto-decides. Long enough for an active player to respond; short enough that an AFK player does not stall the exploration loop indefinitely.`,

  // Focus Multipliers
  focus_res_resource: v =>
    `Resources focus multiplies resource encounter chance by ${v}×. Base 70% → ${(0.70 * v * 100).toFixed(0)}% effective. This is the core reward for choosing this focus — gatherers should feel the difference immediately.`,
  focus_res_enemy: v =>
    `Resources focus reduces enemy encounters to ${v}× base. Base 20% → ${(0.20 * v * 100).toFixed(0)}%. Lower = Resources focus feels safer, with fewer fights interrupting gathering sessions.`,
  focus_res_treasure: v =>
    `Resources focus applies ${v}× to treasure chance. Base 5% → ${(0.05 * v * 100).toFixed(1)}%. Intentionally lower than Treasure focus so that focus choices involve real trade-offs.`,
  focus_enemy_resource: v =>
    `Enemies focus reduces resource encounters to ${v}× base. Base 70% → ${(0.70 * v * 100).toFixed(0)}%. The trade-off for chasing more combat — gathering efficiency takes a hit.`,
  focus_enemy_enemy: v =>
    `Enemies focus multiplies enemy encounter chance by ${v}×. Base 20% → ${(0.20 * v * 100).toFixed(0)}%. This is what combat-oriented players use — the difference should feel very clear.`,
  focus_enemy_treasure: v =>
    `Enemies focus applies ${v}× to treasure. Base 5% → ${(0.05 * v * 100).toFixed(1)}%. A small bonus vs. balanced, but still less than Treasure focus.`,
  focus_treasure_resource: v =>
    `Treasure focus reduces resource encounters to ${v}×. Base 70% → ${(0.70 * v * 100).toFixed(0)}%. The cost of treasure hunting — you gather less material along the way.`,
  focus_treasure_enemy: v =>
    `Treasure focus applies ${v}× to enemy chance. Base 20% → ${(0.20 * v * 100).toFixed(0)}%. Lower values make Treasure focus a relatively safe, non-combat option.`,
  focus_treasure_treasure: v =>
    `Treasure focus multiplies treasure chance by ${v}×. Base 5% → ${(0.05 * v * 100).toFixed(1)}%. This should be noticeably above 1.0 — otherwise there is no reason to pick this focus over Balanced.`,

  // Combat Settings
  max_rounds: v =>
    `If neither fighter wins within ${v} rounds, the fight ends as a draw — both sides survive. At default combat pace, ${v} rounds lasts roughly ${v * 2}–${v * 3} real-time seconds. Raising this allows longer, more tactical fights.`,
  stamina_cost_per_round: v =>
    `The attacker loses ${v} stamina per round. A full ${30}-round fight drains up to ${v * 30} stamina. Setting this to 0 makes combat stamina-free, which is useful if stamina is reserved for other systems.`,

  // Death
  item_drop_chance: v =>
    `Each carried item has a ${(v * 100).toFixed(0)}% chance of being permanently lost when you die. With 10 items, you lose ~${(10 * v).toFixed(1)} on average. 0 = no loss on death (gentle game feel); 1.0 = lose everything carried. Stash is always safe.`,

  // World Boss
  spawn_interval_hours: v =>
    `A new boss spawns every ${v} hour${v === 1 ? '' : 's'} per biome+tier. In 24 hours: ${Math.floor(24 / v)} boss windows per zone. Lower = more events; keep in mind player fatigue and server scheduling.`,
  queue_window_seconds: v =>
    `Players have ${v}s (${(v / 60).toFixed(1)} min) to join after the boss announcement. The fight starts early if the max player count is reached before the window closes.`,
  min_players: v =>
    `At least ${v} player${v === 1 ? '' : 's'} must join before the fight starts. This prevents a single player from triggering and trivially farming a boss alone for top-tier loot.`,
  max_players: v =>
    `A single boss accommodates at most ${v} participants. With boss_hp_multiplier=10 and average 200 HP: a full group faces ${v * 10 * 200} total boss HP. Past this cap, the queue closes.`,
  boss_hp_multiplier: v =>
    `bossHP = avgPlayerMaxHP × ${v} × playerCount. With 10 players averaging 200 HP: ${10 * v * 200} total HP. Raise to make fights feel epic; lower for quicker clears if you want bosses as routine content.`,
  boss_damage_per_player: v =>
    `Boss damage output scales by ×${v} per player in the fight. At 5 players: ×${(5 * v).toFixed(1)} total damage. This prevents large groups from simply healing through everything — the boss punches proportionally harder.`,

  // Arena
  queue_timeout_seconds: v =>
    `If no opponent is found within ${v}s (${(v / 60).toFixed(1)} min), the queue cancels automatically. Prevents players being stuck in queue indefinitely during off-peak hours.`,
  matchmaking_range: v =>
    `Players can only face opponents within ±${v} main levels. Level 20 fights levels ${20 - v}–${20 + v}. Wider range fills queues faster but creates skill gaps; narrower means fairer fights but longer waits.`,
  points_per_win: v =>
    `Winners earn ${v} arena points per victory. To reach 1,000 points from zero (ignoring losses), a player needs ${Math.ceil(1000 / v)} wins. Adjust together with points_per_loss to tune how volatile the leaderboard is.`,
  points_per_loss: v =>
    `Losers drop ${v} arena points. A 3-win streak (+${3 * 30} pts) is fully erased by ${Math.ceil((3 * 30) / v)} consecutive losses. Higher values make rank more volatile; lower values reward consistency.`,

  // Rarities
  weight_common: v => {
    const total = v + 0.40 + 0.15 + 0.04 + 0.01;
    return `Common is the baseline weight (${v}). With all default weights, Common items account for ${(v / total * 100).toFixed(1)}% of all drops. Raising this makes every other rarity proportionally rarer.`;
  },
  weight_uncommon: v => {
    const total = 1.0 + v + 0.15 + 0.04 + 0.01;
    return `Uncommon accounts for ${(v / total * 100).toFixed(1)}% of all drops (with default other weights). For every 100 items, ~${Math.round(v / total * 100)} should be Uncommon on average.`;
  },
  weight_rare: v => {
    const total = 1.0 + 0.40 + v + 0.04 + 0.01;
    return `Rare accounts for ${(v / total * 100).toFixed(1)}% of drops. Roughly 1 Rare per ${Math.round(total / v)} items. This is often the first genuinely exciting milestone drop for new players.`;
  },
  weight_epic: v => {
    const total = 1.0 + 0.40 + 0.15 + v + 0.01;
    return `Epic accounts for ${(v / total * 100).toFixed(1)}% of drops — very rare. Approximately 1 in ${Math.round(total / v)} items. Epics should feel genuinely special; keep this significantly below Rare.`;
  },
  weight_legendary: v => {
    const total = 1.0 + 0.40 + 0.15 + 0.04 + v;
    return `Legendary accounts for ${(v / total * 100).toFixed(2)}% of drops — the rarest tier. Roughly 1 in ${Math.round(total / v)} items. Even a small increase here makes Legendaries feel far less coveted.`;
  },
};

// ─── Field Panel ──────────────────────────────────────────────────────────

function FieldPanel({
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
  const exampleText = FIELD_EXAMPLES[row.key]?.(value) ?? null;

  return (
    <div
      className={[
        'rounded-lg border p-4 flex flex-col gap-2.5 transition-colors',
        dirty ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-background',
      ].join(' ')}
    >
      {/* Label + Input */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-heading leading-snug pt-0.5">{row.label}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            value={value}
            step={row.step}
            min={row.min_value ?? undefined}
            max={row.max_value ?? undefined}
            onChange={e => onChange(row.key, e.target.value)}
            className={[
              'w-24 text-right text-sm px-2.5 py-1 rounded-md border bg-card',
              'focus:outline-none focus:ring-1 focus:ring-primary transition-colors',
              dirty ? 'border-amber-500/60 text-amber-300' : 'border-border text-foreground',
            ].join(' ')}
          />
          {row.unit && (
            <span className="text-xs text-muted-foreground w-8 shrink-0 leading-none">{row.unit}</span>
          )}
        </div>
      </div>

      {/* Short DB description */}
      {row.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{row.description}</p>
      )}

      {/* Live example */}
      {exampleText && (
        <div className="rounded-md bg-primary/5 border border-primary/15 px-3 py-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="text-primary font-semibold">Example: </span>
            {exampleText}
          </p>
        </div>
      )}

      {dirty && (
        <p className="text-[10px] text-amber-400/70">Previously saved: {savedValue}</p>
      )}
    </div>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────

function CategoryCard({
  category,
  rows,
  values,
  savedValues,
  onChange,
  onSave,
  onReset,
}: {
  category: string;
  rows: ConfigRow[];
  values: Record<string, number>;
  savedValues: Record<string, number>;
  onChange: (key: string, raw: string) => void;
  onSave: (keys: string[]) => Promise<{ error?: string }>;
  onReset: (keys: string[]) => Promise<{ error?: string }>;
}) {
  const meta = CAT_META[category];
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const dirtyKeys = sorted.filter(r => values[r.key] !== savedValues[r.key]).map(r => r.key);
  const anyDirty = dirtyKeys.length > 0;
  const isFocusMults = category === 'focus_mults';

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    const result = await onSave(sorted.map(r => r.key));
    setSaving(false);
    if (result.error) {
      setErrorMsg(result.error);
    } else {
      setFlash(true);
      setTimeout(() => setFlash(false), 3000);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setErrorMsg('');
    const result = await onReset(sorted.map(r => r.key));
    setResetting(false);
    if (result.error) {
      setErrorMsg(result.error);
    } else {
      setFlash(true);
      setTimeout(() => setFlash(false), 3000);
    }
  };

  if (!meta) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header — click to collapse/expand */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xl leading-none">{meta.icon}</span>
          <span className="font-bold text-heading text-base">{meta.title}</span>
          <span className="text-xs text-muted-foreground">
            {rows.length} setting{rows.length === 1 ? '' : 's'}
          </span>
          {anyDirty && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {dirtyKeys.length} unsaved
            </span>
          )}
          {flash && !anyDirty && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ✓ Saved
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-xs select-none ml-4">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Formula block + description */}
          <div className="px-5 pt-4 pb-3 space-y-2">
            <pre className="text-[11px] font-mono bg-background border border-border rounded-lg px-4 py-3 text-muted-foreground overflow-x-auto whitespace-pre leading-relaxed">
              {meta.formula}
            </pre>
            <p className="text-xs text-muted-foreground leading-relaxed">{meta.desc}</p>
          </div>

          {/* Field panels */}
          <div className="px-5 pb-4">
            {isFocusMults ? (
              <FocusMultsGrid rows={sorted} values={values} savedValues={savedValues} onChange={onChange} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {sorted.map(r => (
                  <FieldPanel
                    key={r.key}
                    row={r}
                    value={values[r.key] ?? Number(r.value)}
                    savedValue={savedValues[r.key] ?? Number(r.value)}
                    onChange={onChange}
                  />
                ))}
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="mx-5 mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {errorMsg}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background/20">
            <button
              onClick={handleReset}
              disabled={resetting || saving}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {resetting ? 'Resetting…' : 'Reset all to defaults'}
            </button>
            <button
              onClick={handleSave}
              disabled={!anyDirty || saving || resetting}
              className="px-4 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Focus multipliers: sub-group headers + panels ────────────────────────

function FocusMultsGrid({
  rows,
  values,
  savedValues,
  onChange,
}: {
  rows: ConfigRow[];
  values: Record<string, number>;
  savedValues: Record<string, number>;
  onChange: (key: string, raw: string) => void;
}) {
  let lastGroup = '';
  return (
    <div className="space-y-3">
      {rows.map(r => {
        const group = FOCUS_GROUPS[r.key] ?? '';
        const showHeader = group !== lastGroup;
        lastGroup = group;
        return (
          <div key={r.key}>
            {showHeader && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-3 pb-1">
                {group}
              </p>
            )}
            <FieldPanel
              row={r}
              value={values[r.key] ?? Number(r.value)}
              savedValue={savedValues[r.key] ?? Number(r.value)}
              onChange={onChange}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────

export default function FormulasClient({ initialConfig }: { initialConfig: ConfigRow[] }) {
  const router = useRouter();

  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(initialConfig.map(r => [r.key, Number(r.value)]))
  );
  const [savedValues, setSavedValues] = useState<Record<string, number>>(
    () => Object.fromEntries(initialConfig.map(r => [r.key, Number(r.value)]))
  );

  const handleChange = useCallback((key: string, raw: string) => {
    const num = parseFloat(raw);
    if (!isNaN(num)) setValues(prev => ({ ...prev, [key]: num }));
  }, []);

  // Save only the dirty keys within a category
  const handleSave = useCallback(async (categoryKeys: string[]): Promise<{ error?: string }> => {
    const dirty = categoryKeys
      .filter(key => values[key] !== savedValues[key])
      .map(key => ({ key, value: values[key] }));
    if (!dirty.length) return {};
    const result = await saveConfigValues(dirty);
    if (!result.error) {
      setSavedValues(prev => {
        const next = { ...prev };
        dirty.forEach(({ key, value }) => { next[key] = value; });
        return next;
      });
      router.refresh();
    }
    return result;
  }, [values, savedValues, router]);

  // Reset a category to defaults
  const handleReset = useCallback(async (categoryKeys: string[]): Promise<{ error?: string }> => {
    const result = await resetConfigToDefaults(categoryKeys);
    if (!result.error) {
      const defaults = Object.fromEntries(
        initialConfig
          .filter(r => categoryKeys.includes(r.key))
          .map(r => [r.key, Number(r.default_value)])
      );
      setValues(prev => ({ ...prev, ...defaults }));
      setSavedValues(prev => ({ ...prev, ...defaults }));
      router.refresh();
    }
    return result;
  }, [initialConfig, router]);

  const byCategory = Object.fromEntries(
    CAT_ORDER.map(cat => [cat, initialConfig.filter(r => r.category === cat)])
  );

  if (!initialConfig.length) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
        <p className="text-amber-400 font-semibold mb-1">game_config table not found</p>
        <p className="text-sm text-muted-foreground">
          Apply{' '}
          <code className="bg-background px-1 rounded text-xs">
            supabase/migrations/014_game_config.sql
          </code>{' '}
          in the Supabase SQL Editor to seed the table.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {CAT_ORDER.map(cat => {
        const rows = byCategory[cat];
        if (!rows?.length) return null;
        return (
          <CategoryCard
            key={cat}
            category={cat}
            rows={rows}
            values={values}
            savedValues={savedValues}
            onChange={handleChange}
            onSave={handleSave}
            onReset={handleReset}
          />
        );
      })}
    </div>
  );
}

