/**
 * Static game content: raw resources, refined materials, and crafting recipes.
 * All tiers, names, and ingredient quantities are defined here.
 * Skill requirements come from TIER_REQ_SKILL indexed by tier (0-based).
 */

/** Minimum skill level required to access each tier (index = tier - 1). */
export const TIER_REQ_SKILL = [0, 15, 30, 50, 70] as const;

/** Tailwind text colour class per tier. */
export const TIER_COLORS = [
  'text-foreground',
  'text-green-400',
  'text-blue-400',
  'text-purple-400',
  'text-yellow-400',
] as const;

/** Tailwind border colour class per tier. */
export const TIER_BORDER = [
  'border-border',
  'border-green-500/40',
  'border-blue-500/40',
  'border-purple-500/40',
  'border-yellow-500/40',
] as const;

// ─── Raw Resources (Gathering) ────────────────────────────────────────────────

export interface RawResource {
  key: string;
  label: string;
  icon: string;
  /** Matches `skills.name` in the DB. */
  skillName: string;
  /** Item name per tier (index = tier - 1). */
  tierNames: readonly string[];
}

export const RAW_RESOURCES: RawResource[] = [
  {
    key: 'wood', label: 'Wood', icon: '🪵', skillName: 'wood_chopping',
    tierNames: ['Oak Logs', 'Birch Logs', 'Mahogany Logs', 'Ebony Logs', 'Voidwood Logs'],
  },
  {
    key: 'stone', label: 'Stone', icon: '🪨', skillName: 'stone_mining',
    tierNames: ['Limestone', 'Granite', 'Slate', 'Marble', 'Obsidian Stone'],
  },
  {
    key: 'metal', label: 'Metal', icon: '⛏️', skillName: 'ore_mining',
    tierNames: ['Copper Ore', 'Iron Ore', 'Silver Ore', 'Mithril Ore', 'Void Ore'],
  },
  {
    key: 'hide', label: 'Hide', icon: '🐾', skillName: 'hunting',
    tierNames: ['Rabbit Hide', 'Wolf Pelt', 'Bear Pelt', 'Drake Scale', 'Shadow Hide'],
  },
  {
    key: 'fiber', label: 'Fiber', icon: '🌿', skillName: 'herb_gathering',
    tierNames: ['Cotton Fiber', 'Silk Thread', 'Velvet Fiber', 'Starweave Fiber', 'Void Silk'],
  },
];

// ─── Refined Resources (Refining) ────────────────────────────────────────────

export interface RefinedResource {
  key: string;
  label: string;
  icon: string;
  /** Matches `skills.name` in the DB. */
  skillName: string;
  /** Which raw resource key this refines from. */
  rawKey: string;
  /** How many raw items are consumed per 1 refined output, per tier. */
  rawPerUnit: readonly number[];
  /** Item name per tier (index = tier - 1). */
  tierNames: readonly string[];
}

export const REFINED_RESOURCES: RefinedResource[] = [
  {
    key: 'planks', label: 'Planks', icon: '🪵', skillName: 'woodcutting', rawKey: 'wood',
    rawPerUnit: [3, 3, 4, 4, 5],
    tierNames: ['Oak Planks', 'Birch Planks', 'Mahogany Planks', 'Ebony Planks', 'Voidwood Planks'],
  },
  {
    key: 'cut_stone', label: 'Cut Stone', icon: '🧱', skillName: 'stonecutting', rawKey: 'stone',
    rawPerUnit: [4, 4, 5, 5, 6],
    tierNames: ['Limestone Block', 'Granite Block', 'Slate Slab', 'Marble Block', 'Obsidian Block'],
  },
  {
    key: 'ingots', label: 'Ingots', icon: '🔩', skillName: 'smelting', rawKey: 'metal',
    rawPerUnit: [4, 4, 5, 5, 6],
    tierNames: ['Copper Ingot', 'Iron Ingot', 'Silver Ingot', 'Mithril Ingot', 'Void Ingot'],
  },
  {
    key: 'leather', label: 'Leather', icon: '🧤', skillName: 'tanning', rawKey: 'hide',
    rawPerUnit: [3, 3, 4, 4, 5],
    tierNames: ['Basic Leather', 'Cured Leather', 'Thick Leather', 'Dragonscale', 'Shadow Leather'],
  },
  {
    key: 'cloth', label: 'Cloth', icon: '🧵', skillName: 'weaving', rawKey: 'fiber',
    rawPerUnit: [4, 4, 5, 5, 6],
    tierNames: ['Cotton Cloth', 'Silk Cloth', 'Velvet Cloth', 'Starweave Cloth', 'Void Cloth'],
  },
];

// ─── Crafting Recipes ─────────────────────────────────────────────────────────

export interface CraftIngredient {
  refinedKey: string;
  qty: number;
}

export interface CraftTier {
  name: string;
  reqSkill: number;
  goldCost: number;
  ingredients: CraftIngredient[];
}

export interface CraftRecipe {
  key: string;
  label: string;
  icon: string;
  /** Matches `skills.name` in the DB. */
  skillName: string;
  tiers: CraftTier[];
}

export interface CraftCategory {
  key: string;
  label: string;
  icon: string;
  recipes: CraftRecipe[];
}

export const CRAFT_CATEGORIES: CraftCategory[] = [
  {
    key: 'weapons', label: 'Weapons', icon: '⚔️',
    recipes: [
      { key: 'sword', label: 'Sword', icon: '🗡️', skillName: 'sword_crafting',
        tiers: [
          { name: 'Copper Sword',  reqSkill: 0,  goldCost: 10,  ingredients: [{ refinedKey: 'ingots', qty: 3 }, { refinedKey: 'planks', qty: 1 }] },
          { name: 'Iron Sword',    reqSkill: 15, goldCost: 30,  ingredients: [{ refinedKey: 'ingots', qty: 4 }, { refinedKey: 'planks', qty: 1 }] },
          { name: 'Silver Sword',  reqSkill: 30, goldCost: 75,  ingredients: [{ refinedKey: 'ingots', qty: 5 }, { refinedKey: 'planks', qty: 2 }] },
          { name: 'Mithril Sword', reqSkill: 50, goldCost: 200, ingredients: [{ refinedKey: 'ingots', qty: 6 }, { refinedKey: 'planks', qty: 2 }] },
          { name: 'Void Sword',    reqSkill: 70, goldCost: 500, ingredients: [{ refinedKey: 'ingots', qty: 8 }, { refinedKey: 'planks', qty: 3 }] },
        ],
      },
      { key: 'bow', label: 'Bow', icon: '🏹', skillName: 'bow_crafting',
        tiers: [
          { name: 'Oak Shortbow',  reqSkill: 0,  goldCost: 8,   ingredients: [{ refinedKey: 'planks', qty: 4 }, { refinedKey: 'cloth', qty: 2 }] },
          { name: 'Birch Longbow', reqSkill: 15, goldCost: 25,  ingredients: [{ refinedKey: 'planks', qty: 5 }, { refinedKey: 'cloth', qty: 3 }] },
          { name: 'Mahogany Bow',  reqSkill: 30, goldCost: 65,  ingredients: [{ refinedKey: 'planks', qty: 6 }, { refinedKey: 'cloth', qty: 4 }] },
          { name: 'Ebony Recurve', reqSkill: 50, goldCost: 180, ingredients: [{ refinedKey: 'planks', qty: 7 }, { refinedKey: 'cloth', qty: 5 }] },
          { name: 'Void Bow',      reqSkill: 70, goldCost: 450, ingredients: [{ refinedKey: 'planks', qty: 9 }, { refinedKey: 'cloth', qty: 6 }] },
        ],
      },
      { key: 'staff', label: 'Staff', icon: '🪄', skillName: 'staff_crafting',
        tiers: [
          { name: 'Apprentice Staff', reqSkill: 0,  goldCost: 12,  ingredients: [{ refinedKey: 'planks', qty: 3 }, { refinedKey: 'cloth', qty: 2 }] },
          { name: 'Iron-Cap Staff',   reqSkill: 15, goldCost: 35,  ingredients: [{ refinedKey: 'planks', qty: 4 }, { refinedKey: 'cloth', qty: 2 }, { refinedKey: 'ingots', qty: 1 }] },
          { name: 'Crystal Staff',    reqSkill: 30, goldCost: 90,  ingredients: [{ refinedKey: 'planks', qty: 5 }, { refinedKey: 'cloth', qty: 3 }, { refinedKey: 'ingots', qty: 2 }] },
          { name: 'Mithril Staff',    reqSkill: 50, goldCost: 250, ingredients: [{ refinedKey: 'planks', qty: 6 }, { refinedKey: 'cloth', qty: 3 }, { refinedKey: 'ingots', qty: 2 }] },
          { name: 'Void Staff',       reqSkill: 70, goldCost: 600, ingredients: [{ refinedKey: 'planks', qty: 8 }, { refinedKey: 'cloth', qty: 4 }, { refinedKey: 'ingots', qty: 3 }] },
        ],
      },
    ],
  },
  {
    key: 'armor', label: 'Armor', icon: '🛡️',
    recipes: [
      { key: 'plate', label: 'Plate', icon: '🧲', skillName: 'plate_crafting',
        tiers: [
          { name: 'Copper Plate',  reqSkill: 0,  goldCost: 15,  ingredients: [{ refinedKey: 'ingots', qty: 6 }] },
          { name: 'Iron Plate',    reqSkill: 15, goldCost: 45,  ingredients: [{ refinedKey: 'ingots', qty: 8 }] },
          { name: 'Steel Plate',   reqSkill: 30, goldCost: 120, ingredients: [{ refinedKey: 'ingots', qty: 10 }, { refinedKey: 'cut_stone', qty: 2 }] },
          { name: 'Mithril Plate', reqSkill: 50, goldCost: 350, ingredients: [{ refinedKey: 'ingots', qty: 12 }, { refinedKey: 'planks', qty: 2 }] },
          { name: 'Void Plate',    reqSkill: 70, goldCost: 800, ingredients: [{ refinedKey: 'ingots', qty: 15 }, { refinedKey: 'planks', qty: 3 }] },
        ],
      },
      { key: 'leather_armor', label: 'Leather', icon: '🧥', skillName: 'leather_crafting',
        tiers: [
          { name: 'Basic Leathers',      reqSkill: 0,  goldCost: 10,  ingredients: [{ refinedKey: 'leather', qty: 4 }] },
          { name: 'Cured Leather Armor', reqSkill: 15, goldCost: 30,  ingredients: [{ refinedKey: 'leather', qty: 5 }] },
          { name: 'Thick Leather Armor', reqSkill: 30, goldCost: 80,  ingredients: [{ refinedKey: 'leather', qty: 6 }, { refinedKey: 'cloth', qty: 2 }] },
          { name: 'Dragonscale Armor',   reqSkill: 50, goldCost: 220, ingredients: [{ refinedKey: 'leather', qty: 8 }, { refinedKey: 'cloth', qty: 3 }] },
          { name: 'Shadow Leather',      reqSkill: 70, goldCost: 550, ingredients: [{ refinedKey: 'leather', qty: 10 }, { refinedKey: 'cloth', qty: 4 }] },
        ],
      },
      { key: 'robe', label: 'Robe', icon: '👘', skillName: 'robe_crafting',
        tiers: [
          { name: 'Cotton Robe',    reqSkill: 0,  goldCost: 12,  ingredients: [{ refinedKey: 'cloth', qty: 5 }] },
          { name: 'Silk Robe',      reqSkill: 15, goldCost: 35,  ingredients: [{ refinedKey: 'cloth', qty: 6 }] },
          { name: 'Velvet Robe',    reqSkill: 30, goldCost: 100, ingredients: [{ refinedKey: 'cloth', qty: 8 }, { refinedKey: 'ingots', qty: 2 }] },
          { name: 'Starweave Robe', reqSkill: 50, goldCost: 280, ingredients: [{ refinedKey: 'cloth', qty: 10 }, { refinedKey: 'ingots', qty: 2 }] },
          { name: 'Void Robe',      reqSkill: 70, goldCost: 650, ingredients: [{ refinedKey: 'cloth', qty: 12 }, { refinedKey: 'ingots', qty: 3 }] },
        ],
      },
    ],
  },
  {
    key: 'tools', label: 'Tools', icon: '⚒️',
    recipes: [
      {
        key: 'axe', label: 'Axe', icon: '🪓', skillName: 'axe_crafting',
        tiers: [
          { name: 'Copper Axe',   reqSkill: 0,  goldCost: 8,   ingredients: [{ refinedKey: 'ingots', qty: 2 }, { refinedKey: 'planks', qty: 1 }] },
          { name: 'Iron Axe',     reqSkill: 15, goldCost: 22,  ingredients: [{ refinedKey: 'ingots', qty: 3 }, { refinedKey: 'planks', qty: 1 }] },
          { name: 'Steel Axe',    reqSkill: 30, goldCost: 60,  ingredients: [{ refinedKey: 'ingots', qty: 4 }, { refinedKey: 'planks', qty: 2 }] },
          { name: 'Mithril Axe',  reqSkill: 50, goldCost: 160, ingredients: [{ refinedKey: 'ingots', qty: 5 }, { refinedKey: 'planks', qty: 2 }] },
          { name: 'Void Axe',     reqSkill: 70, goldCost: 400, ingredients: [{ refinedKey: 'ingots', qty: 7 }, { refinedKey: 'planks', qty: 3 }] },
        ],
      },
      {
        key: 'hammer', label: 'Hammer', icon: '🔨', skillName: 'hammer_crafting',
        tiers: [
          { name: 'Copper Hammer',  reqSkill: 0,  goldCost: 8,   ingredients: [{ refinedKey: 'ingots', qty: 2 }, { refinedKey: 'cut_stone', qty: 1 }] },
          { name: 'Iron Hammer',    reqSkill: 15, goldCost: 22,  ingredients: [{ refinedKey: 'ingots', qty: 3 }, { refinedKey: 'cut_stone', qty: 1 }] },
          { name: 'Steel Hammer',   reqSkill: 30, goldCost: 60,  ingredients: [{ refinedKey: 'ingots', qty: 4 }, { refinedKey: 'cut_stone', qty: 2 }] },
          { name: 'Mithril Hammer', reqSkill: 50, goldCost: 160, ingredients: [{ refinedKey: 'ingots', qty: 5 }, { refinedKey: 'cut_stone', qty: 2 }] },
          { name: 'Void Hammer',    reqSkill: 70, goldCost: 400, ingredients: [{ refinedKey: 'ingots', qty: 7 }, { refinedKey: 'cut_stone', qty: 3 }] },
        ],
      },
      {
        key: 'pickaxe', label: 'Pickaxe', icon: '⛏️', skillName: 'pickaxe_crafting',
        tiers: [
          { name: 'Copper Pickaxe',  reqSkill: 0,  goldCost: 8,   ingredients: [{ refinedKey: 'ingots', qty: 2 }, { refinedKey: 'planks', qty: 1 }] },
          { name: 'Iron Pickaxe',    reqSkill: 15, goldCost: 22,  ingredients: [{ refinedKey: 'ingots', qty: 3 }, { refinedKey: 'planks', qty: 1 }] },
          { name: 'Steel Pickaxe',   reqSkill: 30, goldCost: 60,  ingredients: [{ refinedKey: 'ingots', qty: 4 }, { refinedKey: 'planks', qty: 2 }] },
          { name: 'Mithril Pickaxe', reqSkill: 50, goldCost: 160, ingredients: [{ refinedKey: 'ingots', qty: 5 }, { refinedKey: 'planks', qty: 2 }] },
          { name: 'Void Pickaxe',    reqSkill: 70, goldCost: 400, ingredients: [{ refinedKey: 'ingots', qty: 7 }, { refinedKey: 'planks', qty: 3 }] },
        ],
      },
      {
        key: 'knife', label: 'Knife', icon: '🔪', skillName: 'knife_crafting',
        tiers: [
          { name: 'Copper Knife',  reqSkill: 0,  goldCost: 6,   ingredients: [{ refinedKey: 'ingots', qty: 2 }, { refinedKey: 'leather', qty: 1 }] },
          { name: 'Iron Knife',    reqSkill: 15, goldCost: 18,  ingredients: [{ refinedKey: 'ingots', qty: 3 }, { refinedKey: 'leather', qty: 1 }] },
          { name: 'Silver Knife',  reqSkill: 30, goldCost: 50,  ingredients: [{ refinedKey: 'ingots', qty: 4 }, { refinedKey: 'leather', qty: 2 }] },
          { name: 'Mithril Knife', reqSkill: 50, goldCost: 140, ingredients: [{ refinedKey: 'ingots', qty: 5 }, { refinedKey: 'leather', qty: 2 }] },
          { name: 'Void Knife',    reqSkill: 70, goldCost: 350, ingredients: [{ refinedKey: 'ingots', qty: 7 }, { refinedKey: 'leather', qty: 3 }] },
        ],
      },
      {
        key: 'sickle', label: 'Sickle', icon: '🌾', skillName: 'sickle_crafting',
        tiers: [
          { name: 'Copper Sickle',  reqSkill: 0,  goldCost: 6,   ingredients: [{ refinedKey: 'ingots', qty: 2 }, { refinedKey: 'cloth', qty: 1 }] },
          { name: 'Iron Sickle',    reqSkill: 15, goldCost: 18,  ingredients: [{ refinedKey: 'ingots', qty: 3 }, { refinedKey: 'cloth', qty: 1 }] },
          { name: 'Silver Sickle',  reqSkill: 30, goldCost: 50,  ingredients: [{ refinedKey: 'ingots', qty: 4 }, { refinedKey: 'cloth', qty: 2 }] },
          { name: 'Mithril Sickle', reqSkill: 50, goldCost: 140, ingredients: [{ refinedKey: 'ingots', qty: 5 }, { refinedKey: 'cloth', qty: 2 }] },
          { name: 'Void Sickle',    reqSkill: 70, goldCost: 350, ingredients: [{ refinedKey: 'ingots', qty: 7 }, { refinedKey: 'cloth', qty: 3 }] },
        ],
      },
    ],
  },
];

// ─── Usage / Mastery Skills (displayed in Usage tab) ─────────────────────────

export interface UsageSkillDef {
  skillName: string;
  label: string;
  icon: string;
  description: string;
}

export interface UsageCategory {
  key: string;
  label: string;
  icon: string;
  skills: UsageSkillDef[];
}

export const USAGE_CATEGORIES: UsageCategory[] = [
  {
    key: 'weapons', label: 'Weapons', icon: '⚔️',
    skills: [
      { skillName: 'sword_mastery', label: 'Sword Mastery', icon: '🗡️', description: 'Proficiency with swords in combat.' },
      { skillName: 'bow_mastery',   label: 'Bow Mastery',   icon: '🏹', description: 'Proficiency with bows in combat.' },
      { skillName: 'staff_mastery', label: 'Staff Mastery', icon: '🪄', description: 'Proficiency with magic staves.' },
    ],
  },
  {
    key: 'armor', label: 'Armor', icon: '🛡️',
    skills: [
      { skillName: 'plate_mastery',   label: 'Plate Mastery',   icon: '🧲', description: 'Reduces penalties wearing heavy plate armour.' },
      { skillName: 'leather_mastery', label: 'Leather Mastery', icon: '🧥', description: 'Reduces penalties wearing light leather armour.' },
      { skillName: 'robe_mastery',    label: 'Robe Mastery',    icon: '👘', description: 'Reduces penalties wearing mage robes.' },
    ],
  },
  {
    key: 'tools', label: 'Tools', icon: '⚒️',
    skills: [
      { skillName: 'axe_mastery',     label: 'Axe Mastery',     icon: '🪓', description: 'Increases yield and speed with woodcutting axes.' },
      { skillName: 'hammer_mastery',  label: 'Hammer Mastery',  icon: '🔨', description: 'Increases yield and speed with quarry hammers.' },
      { skillName: 'pickaxe_mastery', label: 'Pickaxe Mastery', icon: '⛏️', description: 'Increases yield and speed with mining pickaxes.' },
      { skillName: 'knife_mastery',   label: 'Knife Mastery',   icon: '🔪', description: 'Increases yield and speed with hunting knives.' },
      { skillName: 'sickle_mastery',  label: 'Sickle Mastery',  icon: '🌾', description: 'Increases yield and speed with harvest sickles.' },
    ],
  },
];
