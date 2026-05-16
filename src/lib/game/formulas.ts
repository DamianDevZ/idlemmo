/**
 * Pure game math functions.
 * All constants are imported from game.config so changing one number there
 * propagates here automatically. No side effects — safe to call anywhere.
 */
import { GAME_CONFIG } from '@/config/game.config';
import type { DerivedStats, DbCharacterAttributes } from '@/types/game';

const C = GAME_CONFIG;
const A = C.attributes;
const S = C.skills;

// ─── Main Level ───────────────────────────────────────────────────────────────

/** XP required to advance FROM `level` to `level + 1`. */
export function xpRequiredForLevel(level: number): number {
  return Math.floor(
    C.character.xpToLevelBase * Math.pow(C.character.xpScalingFactor, level - 1)
  );
}

/** Cumulative XP needed to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpRequiredForLevel(l);
  return total;
}

// ─── Derived Stats from Attributes ───────────────────────────────────────────

export function calcMaxHp(vigor: number): number {
  return A.baseHp + vigor * A.hpPerVigor;
}

export function calcCarrySlots(endurance: number): number {
  return A.baseCarrySlots + endurance * A.slotsPerEndurance;
}

/** HP recovered per minute when not in combat. */
export function calcHpRegenPerMin(faith: number): number {
  return faith * A.hpRegenPerFaith;
}

/**
 * Compute all derived stats from raw attributes in one pass.
 * Used for display and server-side validation.
 */
export function calcDerivedStats(attrs: DbCharacterAttributes, armorRating: number): DerivedStats {
  return {
    maxHp: calcMaxHp(attrs.vigor),
    maxStamina: attrs.endurance * 10,
    carrySlots: calcCarrySlots(attrs.endurance),
    hpRegenPerMin: calcHpRegenPerMin(attrs.faith),
    // Endurance also drives how many offline ticks are allowed (base 10 + 1 per 2 endurance)
    offlineTicks: 10 + Math.floor(attrs.endurance / 2),
    // Faith multiplies consumable effects (1.0 at faith=0, +2% per point)
    faithConsumableMult: 1 + attrs.faith * 0.02,
    // Arcane adds bonus rare/quality find % while exploring
    arcaneExploreLuck: attrs.arcane * A.arcaneRareFactor,

    // Gather — divisor: tickMs = base / gatherSpeedDivisor
    gatherSpeedDivisor:
      (1 + attrs.dexterity * A.dexGatherSpeedFactor),

    // Gather — yield multiplier
    gatherYieldMult:
      (1 + attrs.strength * A.strGatherYieldFactor),

    rareChanceBonus: attrs.arcane * A.arcaneRareFactor,

    refineEfficiencyMult:
      (1 + attrs.intelligence * A.intRefineFactor),

    craftSuccessBonus: attrs.faith * A.faithCraftBonus,

    meleeDamageMult:
      (1 + attrs.strength / A.strMeleeDivisor),

    rangedDamageMult:
      (1 + attrs.dexterity / A.dexRangedDivisor),

    magicDamageMult:
      (1 + attrs.intelligence / A.intMagicDivisor),

    attackSpeedMult:
      (1 + attrs.dexterity / A.dexSpeedDivisor),

    critChance: attrs.dexterity * A.dexCritFactor,

    critDamageMult:
      A.critDamageBase + attrs.dexterity * A.dexCritDamageFactor,

    defenseReduction: calcDefenseReduction(armorRating),
  };
}

// ─── Gathering ────────────────────────────────────────────────────────────────

/**
 * Tick duration in milliseconds. Lower = faster actions.
 * @param baseMs      Base duration defined on the resource type
 * @param dexterity   Character dexterity attribute
 * @param skillLevel  Relevant gathering sub-skill level
 * @param toolSpeedMult  Multiplier from equipped tool (1.0 = no bonus)
 */
export function calcGatherTickMs(
  baseMs: number,
  dexterity: number,
  skillLevel: number,
  toolSpeedMult: number = 1,
): number {
  return (
    (baseMs / (1 + dexterity * A.dexGatherSpeedFactor)) /
    (1 + skillLevel * S.speedFactor) /
    toolSpeedMult
  );
}

/**
 * Resource yield per gather tick.
 * @param baseYield   Base yield defined on the resource type
 * @param strength    Character strength attribute
 * @param skillLevel  Relevant gathering sub-skill level
 * @param toolYieldMult  Multiplier from equipped tool (1.0 = no bonus)
 */
export function calcGatherYield(
  baseYield: number,
  strength: number,
  skillLevel: number,
  toolYieldMult: number = 1,
): number {
  return (
    baseYield *
    (1 + strength * A.strGatherYieldFactor) *
    (1 + skillLevel * S.yieldFactor) *
    toolYieldMult
  );
}

/**
 * Rare / quality item chance as a value 0–1.
 * @param baseChance  Base chance defined on the resource (0–1)
 */
export function calcRareChance(
  baseChance: number,
  arcane: number,
  skillLevel: number,
): number {
  return Math.min(
    1,
    baseChance +
      (arcane * A.arcaneRareFactor) / 100 +
      (skillLevel * S.rareFindBonus) / 100,
  );
}

// ─── Combat ───────────────────────────────────────────────────────────────────

/** Skill combat multiplier: 1 + level × FACTOR */
export function calcSkillCombatMult(skillLevel: number): number {
  return 1 + skillLevel * S.combatDamageFactor;
}

export function calcMeleeDamage(weaponBase: number, strength: number, skillLevel: number): number {
  return weaponBase * (1 + strength / A.strMeleeDivisor) * calcSkillCombatMult(skillLevel);
}

export function calcRangedDamage(weaponBase: number, dexterity: number, skillLevel: number): number {
  return weaponBase * (1 + dexterity / A.dexRangedDivisor) * calcSkillCombatMult(skillLevel);
}

export function calcMagicDamage(spellBase: number, intelligence: number, skillLevel: number): number {
  return spellBase * (1 + intelligence / A.intMagicDivisor) * calcSkillCombatMult(skillLevel);
}

export function calcAttackSpeed(weaponBaseSpeed: number, dexterity: number): number {
  return weaponBaseSpeed * (1 + dexterity / A.dexSpeedDivisor);
}

/** Critical hit chance as a percentage (0–100). */
export function calcCritChance(weaponCritBonus: number, dexterity: number): number {
  return Math.min(100, weaponCritBonus + dexterity * A.dexCritFactor);
}

/** Critical hit damage multiplier. */
export function calcCritDamage(dexterity: number): number {
  return A.critDamageBase + dexterity * A.dexCritDamageFactor;
}

/**
 * Damage reduction as 0–1 (hyperbolic, so it never reaches 1).
 * E.g. 100 armor → 50% reduction. 400 armor → 80% reduction.
 */
export function calcDefenseReduction(armorRating: number): number {
  return armorRating / (armorRating + A.armorDivisor);
}

/** Apply damage after defense. Returns integer damage dealt. */
export function applyDefense(rawDamage: number, armorRating: number): number {
  const reduction = calcDefenseReduction(armorRating);
  return Math.max(1, Math.floor(rawDamage * (1 - reduction)));
}

// ─── Refining & Crafting ─────────────────────────────────────────────────────

/**
 * How many output units produced per input unit.
 * @param baseRatio  Defined on the recipe (e.g. 0.9 = 10% material loss)
 */
export function calcRefineEfficiency(
  baseRatio: number,
  intelligence: number,
  skillLevel: number,
): number {
  return (
    baseRatio *
    (1 + intelligence * A.intRefineFactor) *
    (1 + skillLevel * S.yieldFactor)
  );
}

/**
 * Craft success probability as 0–100, capped at 95%.
 * @param baseChance  Defined on the recipe (0–100)
 */
export function calcCraftSuccessChance(
  baseChance: number,
  skillLevel: number,
  faith: number,
): number {
  return Math.min(
    95,
    baseChance + skillLevel * S.craftSuccessBonus + faith * A.faithCraftBonus,
  );
}

// ─── Category Points & Skill Levelling ───────────────────────────────────────

/** Category points accumulated from a given total XP. */
export function categoryPointsFromXp(totalXp: number): number {
  return Math.floor(totalXp / S.categoryXpPerPoint);
}

/**
 * Category points cost to level a sub-skill from `currentLevel` to `currentLevel + 1`.
 * Uses a repeating cycle that increases cost every full cycle.
 */
export function skillLevelUpCost(currentLevel: number): number {
  const cycle = S.levelCostCycle;
  const cycleMult = Math.floor(currentLevel / cycle.length) + 1;
  return cycle[currentLevel % cycle.length] * cycleMult;
}
