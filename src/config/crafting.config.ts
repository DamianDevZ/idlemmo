/**
 * Tier constants shared between crafting/refining panels and the recipe viewer.
 * Static skill-name arrays (RAW_RESOURCES, CRAFT_CATEGORIES, etc.) have been
 * removed -- all skill data now comes from the database via the skills API.
 */

/** Minimum skill level required to access each tier (index = tier - 1). */
export const TIER_REQ_SKILL = [0, 15, 30, 50, 70] as const;

/**
 * CSS utility class for tier text colour.
 * Uses design-token utilities from globals.css -- never hardcode Tailwind colours.
 */
export const TIER_COLORS = [
  'text-tier-0',
  'text-tier-1',
  'text-tier-2',
  'text-tier-3',
  'text-tier-4',
] as const;

/**
 * CSS utility class for tier border colour.
 * Uses design-token utilities from globals.css -- never hardcode Tailwind colours.
 */
export const TIER_BORDER = [
  'border-tier-0',
  'border-tier-1',
  'border-tier-2',
  'border-tier-3',
  'border-tier-4',
] as const;
