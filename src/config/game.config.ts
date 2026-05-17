/**
 * MASTER GAME CONFIGURATION
 *
 * Every tunable number in the game lives here.
 * Change one value → the whole game adjusts automatically.
 * Formulas in src/lib/game/formulas.ts import from this file.
 * Database seed data in supabase/seed.sql references the same constants
 * by naming convention (column defaults match these values).
 */
export const GAME_CONFIG = {

  // ─── Character / Levelling ─────────────────────────────────────────────────
  character: {
    /** XP required for level 1 → 2. Each subsequent level scales by xpScalingFactor. */
    xpToLevelBase: 100,
    /** Multiplicative XP cost increase per level. 1.15 = 15% more XP each level. */
    xpScalingFactor: 1.15,
    /** Skill points awarded each time the character gains a main level. */
    skillPointsPerLevel: 2,
    /** Starting main level for new characters. */
    startingMainLevel: 1,
    /** Starting attribute value for every attribute on character creation. */
    startingAttributeValue: 5,
    /** Points the player gets to distribute freely at character creation. */
    creationBonusPoints: 10,
  },

  // ─── Attributes ─────────────────────────────────────────────────────────────
  attributes: {
    /** Hard cap on any single attribute. */
    maxValue: 99,

    // HP:   maxHp = BASE_HP + vigor × HP_PER_VIGOR
    baseHp: 50,
    hpPerVigor: 15,

    // Carry: slots = BASE_SLOTS + endurance × SLOTS_PER_ENDURANCE
    baseCarrySlots: 20,
    slotsPerEndurance: 2,

    // HP regen out of combat (hp per minute)
    hpRegenPerFaith: 0.5,

    // Gather speed: tickMs = base / (1 + dex × FACTOR)
    dexGatherSpeedFactor: 0.025,

    // Gather yield: yield = base × (1 + str × FACTOR)
    strGatherYieldFactor: 0.02,

    // Refine efficiency: output = base × (1 + int × FACTOR)
    intRefineFactor: 0.01,

    // Craft success bonus per point of faith (added to %)
    faithCraftBonus: 0.5,

    // Rare / quality drop bonus per point of arcane (added to %)
    arcaneRareFactor: 0.1,

    // Combat — tiered stat contribution to damage
    // final_damage = weapon_base + round(stat_bonus × grade_mult)
    // stat_bonus sums contributions across four diminishing tiers.
    statTier1Rate: 5,   // damage per stat point, levels 1–30
    statTier2Rate: 3,   // damage per stat point, levels 31–60
    statTier3Rate: 2,   // damage per stat point, levels 61–100
    statTier4Rate: 1,   // damage per stat point, levels 101+
    statTier1Cap: 30,   // tier 1 ends at this stat level
    statTier2Cap: 60,   // tier 2 ends at this stat level
    statTier3Cap: 100,  // tier 3 ends at this stat level
    // Grade multipliers are hardcoded: F=1.0 D=1.1 C=1.2 B=1.3 A=1.4 S=1.5

    // Combat — attack speed: speed = weaponBase × (1 + dex / DIVISOR)
    dexSpeedDivisor: 25,

    // Combat — crit chance: chance = weaponCrit + dex × FACTOR (%)
    dexCritFactor: 0.3,

    // Combat — crit damage: mult = BASE + dex × FACTOR
    critDamageBase: 1.5,
    dexCritDamageFactor: 0.005,

    // Combat — defence: reduction = armor / (armor + DIVISOR) → 0–1
    armorDivisor: 100,
  },

  // ─── Skills ─────────────────────────────────────────────────────────────────
  skills: {
    /** Category XP earned per activity action tick. */
    categoryXpPerTick: 15,
    /** Category XP required to earn one category point. */
    categoryXpPerPoint: 100,
    /**
     * Cost (in category points) to level a sub-skill from level N.
     * Index = level % length. Repeating cycle with a floor multiplier.
     */
    levelCostCycle: [1, 1, 2, 2, 3, 3, 4, 5, 5, 6] as const,
    /** Hard cap on any sub-skill. */
    maxSkillLevel: 99,

    // Per level bonuses applied in formulas:
    /** Speed bonus per skill level. tickMs /= (1 + level × FACTOR) */
    speedFactor: 0.04,
    /** Yield bonus per skill level. yield *= (1 + level × FACTOR) */
    yieldFactor: 0.03,
    /** Craft success % bonus per skill level. */
    craftSuccessBonus: 2,
    /** Rare find % bonus per skill level. */
    rareFindBonus: 0.05,
    /** Skill mult applied to combat damage. 1 + (level × FACTOR) */
    combatDamageFactor: 0.02,
  },

  // ─── XP Rewards ──────────────────────────────────────────────────────────────
  xpRewards: {
    /** Main XP per item tier when a gathered item is collected. */
    gatherMainXpPerTier: 12,
    /** Gathering category XP per item tier when collected. */
    gatherCatXpPerTier: 18,
    /** Base main XP awarded for defeating an enemy. */
    combatBaseXp: 10,
    /** Additional main XP per enemy level on top of the base. */
    combatXpPerLevel: 5,
    /** Usage category XP per enemy level awarded on kill. */
    combatUsageCatXpPerLevel: 12,
  },

  // ─── Exploration ─────────────────────────────────────────────────────────────
  exploration: {
    /** How often the server tick fires (seconds). Matches pg_cron schedule. */
    tickIntervalSeconds: 5,

    /** Base chance to find a resource on any given tick (0–1). */
    baseResourceChance: 0.70,

    /** Base chance to encounter an enemy on any given tick (0–1). */
    baseEnemyChance: 0.20,

    /** Base chance to find treasure on any given tick (0–1). */
    baseTreasureChance: 0.05,

    /**
     * Multipliers applied to base chances by focus type.
     * Each key is a focus type; values scale the three base chances.
     */
    focusMultipliers: {
      resources: { resource: 1.5, enemy: 0.5,  treasure: 0.8 },
      enemies:   { resource: 0.3, enemy: 2.0,  treasure: 0.6 },
      balanced:  { resource: 1.0, enemy: 1.0,  treasure: 1.0 },
      treasure:  { resource: 0.7, enemy: 0.8,  treasure: 2.0 },
    },

    /** Seconds the client has to respond to a "collect?" prompt before default applies. */
    collectPromptTimeoutSeconds: 30,

    /** Chance per tick of encountering another player in the same biome+tier (0–1). */
    playerEncounterChance: 0.05,

    /** Seconds before a player encounter friend request auto-dismisses. */
    playerEncounterTimeoutSeconds: 60,

    /**
     * A campsite event fires after every Nth tick within a session.
     * At a campsite the player can use consumables, swap loadout items from inventory,
     * or return home before continuing exploration.
     */
    campsiteEveryTicks: 5,
  },

  // ─── Combat ─────────────────────────────────────────────────────────────────
  combat: {
    /** Maximum rounds before a fight is declared a draw (both survive). */
    maxRounds: 30,
    /** Stamina deducted from the character each combat round. */
    staminaCostPerRound: 1,
  },

  // ─── Death ──────────────────────────────────────────────────────────────────
  death: {
    /** Probability that each carried inventory slot is lost on death. */
    itemDropChance: 0.10,
  },

  // ─── Home Base ──────────────────────────────────────────────────────────────
  homeBase: {
    /** Default stash slots for a new character. Upgradeable via crafting. */
    defaultStashSlots: 100,
  },

  // ─── World Bosses ───────────────────────────────────────────────────────────
  worldBoss: {
    /** Hours between boss spawns per biome+tier combination. */
    spawnIntervalHours: 3,
    /** Queue window in seconds. Fight starts early if maxPlayers reached. */
    queueWindowSeconds: 120,
    minPlayers: 2,
    maxPlayers: 20,
    /**
     * Boss HP scaling.
     * bossHp = avgPlayerMaxHp × MULTIPLIER × playerCount
     * Tuned so a fight lasts ~3 minutes with a full group.
     */
    bossHpMultiplier: 10,
    /** Boss damage multiplier vs single player (so even 1 strong player can't trivialise). */
    bossDamagePerPlayer: 0.8,
  },

  // ─── Arena (PvP) ─────────────────────────────────────────────────────────────
  arena: {
    /** Seconds before a queue entry is cancelled. */
    queueTimeoutSeconds: 120,
    /** Match players whose main level is within this range. */
    matchmakingLevelRange: 5,
    /** Arena point reward for a win. */
    pointsPerWin: 30,
    /** Arena points lost on defeat. */
    pointsPerLoss: 10,
  },

  // ─── Biome Tier Access Gates ─────────────────────────────────────────────────
  /**
   * Index 0 = Tier 1, index 4 = Tier 5.
   * requiredSkillLevel: the relevant gathering/combat skill must reach this level.
   * requiredToolTier:   equipped tool must be at least this tier number.
   * requiredAttribute:  optional hard attribute gate (stat name + minimum value).
   */
  tierGates: [
    { tier: 1, requiredSkillLevel: 0,  requiredToolTier: 0, requiredAttribute: null },
    { tier: 2, requiredSkillLevel: 10, requiredToolTier: 2, requiredAttribute: null },
    { tier: 3, requiredSkillLevel: 25, requiredToolTier: 3, requiredAttribute: { stat: 'strength', value: 15 } },
    { tier: 4, requiredSkillLevel: 50, requiredToolTier: 4, requiredAttribute: { stat: 'strength', value: 30 } },
    { tier: 5, requiredSkillLevel: 75, requiredToolTier: 5, requiredAttribute: { stat: 'strength', value: 50 } },
  ] as const,

  // ─── Item Rarities ─────────────────────────────────────────────────────────
  rarities: {
    common:    { label: 'Common',    color: '#9ca3af', dropWeightMult: 1.00 },
    uncommon:  { label: 'Uncommon',  color: '#4ade80', dropWeightMult: 0.40 },
    rare:      { label: 'Rare',      color: '#60a5fa', dropWeightMult: 0.15 },
    epic:      { label: 'Epic',      color: '#c084fc', dropWeightMult: 0.04 },
    legendary: { label: 'Legendary', color: '#f59e0b', dropWeightMult: 0.01 },
  },

} as const;

export type GameConfig = typeof GAME_CONFIG;
