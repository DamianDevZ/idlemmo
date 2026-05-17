// Defines how the 13 DB-level game_config categories are grouped into
// the 5 human-facing "page categories" shown in the formulas admin.
// Changing a dbCats list here automatically updates both the overview
// cards and the dynamic sub-page route.

export const PAGE_CATEGORIES = [
  {
    slug: 'character',
    title: 'Character',
    icon: '🧙',
    desc: 'How characters level up and earn attribute points, how Vigor/Endurance/Faith translate into HP and carry slots, and how each attribute accelerates gathering activities.',
    dbCats: ['levelling', 'hp_carry', 'gathering'],
  },
  {
    slug: 'combat',
    title: 'Combat',
    icon: '⚔️',
    desc: 'Melee, ranged, and magic damage formulas. Attack speed and critical hit scaling. Sub-skill bonuses that apply to fighting. Round limits and draw conditions.',
    dbCats: ['combat_damage', 'combat_speed_crit', 'skills', 'combat_settings'],
  },
  {
    slug: 'exploration',
    title: 'Exploration',
    icon: '🗺️',
    desc: 'How often resources, enemies, and treasures appear per server tick. The Focus multipliers that let players skew the encounter mix toward their preferred playstyle.',
    dbCats: ['exploration', 'focus_mults'],
  },
  {
    slug: 'events',
    title: 'World Events',
    icon: '🏟️',
    desc: 'World boss spawn frequency, HP and damage scaling relative to participant count. Arena matchmaking range, point gain/loss per match, and queue window settings.',
    dbCats: ['world_boss', 'arena'],
  },
  {
    slug: 'loot',
    title: 'Loot & Risk',
    icon: '🎲',
    desc: 'Item drop-on-death probability — what you risk when you die carrying items. Drop-weight multipliers that control how often each rarity tier appears across all loot pools.',
    dbCats: ['death', 'rarities'],
  },
  {
    slug: 'items',
    title: 'Items & Tiers',
    icon: '🗡️',
    desc: 'Global item settings — max tier, tier level gates, and other constants that apply across all item definitions.',
    dbCats: ['items'],
  },
] as const;

export type PageCategorySlug = (typeof PAGE_CATEGORIES)[number]['slug'];

// Keyed lookup used by the dynamic [category] route
export const PAGE_CAT_MAP = Object.fromEntries(
  PAGE_CATEGORIES.map((c) => [c.slug, c]),
) as Record<PageCategorySlug, (typeof PAGE_CATEGORIES)[number]>;
