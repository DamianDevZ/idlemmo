/**
 * Activity gate checks — can this character perform this action?
 * All threshold values come from game.config so tuning is centralised.
 */
import { GAME_CONFIG } from '@/config/game.config';
import type { AttributeName, DbCharacterAttributes, DbBiomeTier, DbItemDefinition } from '@/types/game';

const GATES = GAME_CONFIG.tierGates;

export interface RequirementResult {
  canDo: boolean;
  /** Human-readable reasons why access is denied (empty when canDo = true). */
  reasons: string[];
}

// ─── Biome Tier Access ────────────────────────────────────────────────────────

/**
 * Check whether a character can enter a specific biome tier.
 * @param tier            The biome_tier row from the database
 * @param attrs           Character attribute values
 * @param relevantSkill   Level of the skill relevant to this biome (e.g. wood_chopping for forest)
 * @param equippedToolTier  Tool tier number currently equipped (0 = bare hands)
 */
export function checkBiomeTierAccess(
  tier: DbBiomeTier,
  attrs: DbCharacterAttributes,
  relevantSkillLevel: number,
  equippedToolTier: number,
): RequirementResult {
  const reasons: string[] = [];

  if (relevantSkillLevel < tier.required_skill_level) {
    reasons.push(
      `Requires skill level ${tier.required_skill_level} (you have ${relevantSkillLevel})`,
    );
  }

  if (equippedToolTier < tier.required_tool_tier) {
    reasons.push(
      `Requires a Tier ${tier.required_tool_tier} tool (you have Tier ${equippedToolTier || 'none'})`,
    );
  }

  if (tier.required_attribute) {
    const { stat, value } = tier.required_attribute;
    const charValue = attrs[stat as keyof DbCharacterAttributes] as number;
    if (charValue < value) {
      const label = stat.charAt(0).toUpperCase() + stat.slice(1);
      reasons.push(`Requires ${label} ≥ ${value} (you have ${charValue})`);
    }
  }

  return { canDo: reasons.length === 0, reasons };
}

// ─── Item / Equipment Requirements ───────────────────────────────────────────

/**
 * Check whether a character meets the attribute requirements to equip an item.
 * Requirement keys in item.stats follow the pattern `req_<attribute>`.
 */
export function checkItemRequirements(
  item: DbItemDefinition,
  attrs: DbCharacterAttributes,
): RequirementResult {
  const reasons: string[] = [];
  const reqs = item.stats ?? {};

  const attrNames: AttributeName[] = [
    'vigor', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane',
  ];

  for (const attr of attrNames) {
    const reqKey = `req_${attr}`;
    const required = reqs[reqKey];
    if (required !== undefined) {
      const has = attrs[attr as keyof DbCharacterAttributes] as number;
      if (has < required) {
        const label = attr.charAt(0).toUpperCase() + attr.slice(1);
        reasons.push(`Requires ${label} ${required} (you have ${has})`);
      }
    }
  }

  return { canDo: reasons.length === 0, reasons };
}

// ─── Tier gate helper (config-driven, no DB needed) ──────────────────────────

/**
 * Quick check against the static tier gate config (no DB row needed).
 * Useful for UI — to show which tiers are locked before fetching biome data.
 */
export function checkTierGate(
  tierNumber: number,
  attrs: DbCharacterAttributes,
  relevantSkillLevel: number,
  equippedToolTier: number,
): RequirementResult {
  const gate = GATES.find((g) => g.tier === tierNumber);
  if (!gate) return { canDo: false, reasons: [`Unknown tier: ${tierNumber}`] };

  const reasons: string[] = [];

  if (relevantSkillLevel < gate.requiredSkillLevel) {
    reasons.push(
      `Requires skill level ${gate.requiredSkillLevel} (you have ${relevantSkillLevel})`,
    );
  }

  if (equippedToolTier < gate.requiredToolTier) {
    reasons.push(
      `Requires a Tier ${gate.requiredToolTier} tool (you have Tier ${equippedToolTier || 'none'})`,
    );
  }

  if (gate.requiredAttribute) {
    const { stat, value } = gate.requiredAttribute;
    const charValue = attrs[stat as keyof DbCharacterAttributes] as number;
    if (charValue < value) {
      const label = stat.charAt(0).toUpperCase() + stat.slice(1);
      reasons.push(`Requires ${label} ≥ ${value} (you have ${charValue})`);
    }
  }

  return { canDo: reasons.length === 0, reasons };
}
