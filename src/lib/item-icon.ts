/** Maps item_name (snake_case) to a public icon path. Returns null for items with no icon. */
const ITEM_ICON_MAP: Record<string, string> = {
  // ── Wood / Logs (raw) ────────────────────────────────────────────────────
  oak_log:           '/icons/resources/raw/logs.png',
  birch_log:         '/icons/resources/raw/logs.png',
  pine_log:          '/icons/resources/raw/logs.png',
  mahogany_log:      '/icons/resources/raw/logs.png',
  ebony_log:         '/icons/resources/raw/logs.png',
  hardwood_log:      '/icons/resources/raw/logs.png',
  crystalwood_log:   '/icons/resources/raw/logs.png',
  voidwood_log:      '/icons/resources/raw/logs.png',
  // Planks (refined wood)
  oak_plank:         '/icons/resources/refined/planks.png',
  birch_plank:       '/icons/resources/refined/planks.png',
  pine_plank:        '/icons/resources/refined/planks.png',
  mahogany_plank:    '/icons/resources/refined/planks.png',
  ebony_plank:       '/icons/resources/refined/planks.png',
  voidwood_plank:    '/icons/resources/refined/planks.png',

  // ── Stone (raw) ──────────────────────────────────────────────────────────
  limestone:         '/icons/resources/raw/stone.png',
  granite:           '/icons/resources/raw/stone.png',
  slate:             '/icons/resources/raw/stone.png',
  marble:            '/icons/resources/raw/stone.png',
  obsidian_stone:    '/icons/resources/raw/stone.png',
  // Blocks (refined stone)
  limestone_block:   '/icons/resources/refined/stone_blocks.png',
  granite_block:     '/icons/resources/refined/stone_blocks.png',
  slate_slab:        '/icons/resources/refined/stone_blocks.png',
  marble_block:      '/icons/resources/refined/stone_blocks.png',
  obsidian_block:    '/icons/resources/refined/stone_blocks.png',

  // ── Metal / Ore (raw) ────────────────────────────────────────────────────
  copper_ore:        '/icons/resources/raw/metal.png',
  iron_ore:          '/icons/resources/raw/metal.png',
  silver_ore:        '/icons/resources/raw/metal.png',
  mithril_ore:       '/icons/resources/raw/metal.png',
  void_ore:          '/icons/resources/raw/metal.png',
  // Ingots (refined metal)
  copper_ingot:      '/icons/resources/refined/metal_blocks.png',
  iron_ingot:        '/icons/resources/refined/metal_blocks.png',
  silver_ingot:      '/icons/resources/refined/metal_blocks.png',
  mithril_ingot:     '/icons/resources/refined/metal_blocks.png',
  void_ingot:        '/icons/resources/refined/metal_blocks.png',

  // ── Hide / Pelt (raw) ────────────────────────────────────────────────────
  hide:              '/icons/resources/raw/hide.png',
  rodent_hide:       '/icons/resources/raw/hide.png',
  rabbit_hide:       '/icons/resources/raw/hide.png',
  wolf_pelt:         '/icons/resources/raw/hide.png',
  bear_pelt:         '/icons/resources/raw/hide.png',
  troll_hide:        '/icons/resources/raw/hide.png',
  drake_scale:       '/icons/resources/raw/hide.png',
  shadow_hide:       '/icons/resources/raw/hide.png',
  // Leather (refined hide)
  basic_leather:     '/icons/resources/refined/leather.png',
  leather:           '/icons/resources/refined/leather.png',
  thick_leather:     '/icons/resources/refined/leather.png',
  cured_leather:     '/icons/resources/refined/leather.png',
  shadow_leather:    '/icons/resources/refined/leather.png',

  // ── Fiber / Thread (raw) ─────────────────────────────────────────────────
  cotton_fiber:      '/icons/resources/raw/fiber.png',
  silk_thread:       '/icons/resources/raw/fiber.png',
  velvet_fiber:      '/icons/resources/raw/fiber.png',
  starweave_fiber:   '/icons/resources/raw/fiber.png',
  void_silk:         '/icons/resources/raw/fiber.png',
  // Cloth (refined fiber)
  cotton_cloth:      '/icons/resources/refined/cloth.png',
  silk_cloth:        '/icons/resources/refined/cloth.png',
  velvet_cloth:      '/icons/resources/refined/cloth.png',
  starweave_cloth:   '/icons/resources/refined/cloth.png',
  void_cloth:        '/icons/resources/refined/cloth.png',
  tattered_cloth:    '/icons/resources/refined/cloth.png',

  // ── Equipment ────────────────────────────────────────────────────────────
  // Weapons
  copper_sword:      '/icons/equipment/weapons/sword.png',
  iron_sword:        '/icons/equipment/weapons/sword.png',
  silver_sword:      '/icons/equipment/weapons/sword.png',
  mithril_sword:     '/icons/equipment/weapons/sword.png',
  void_sword:        '/icons/equipment/weapons/sword.png',
  crude_knife:       '/icons/equipment/weapons/sword.png',
  iron_dagger:       '/icons/equipment/weapons/sword.png',

  oak_shortbow:      '/icons/equipment/weapons/bow.png',
  birch_longbow:     '/icons/equipment/weapons/bow.png',
  mahogany_bow:      '/icons/equipment/weapons/bow.png',
  ebony_recurve:     '/icons/equipment/weapons/bow.png',
  void_bow:          '/icons/equipment/weapons/bow.png',

  apprentice_staff:  '/icons/equipment/weapons/staff.png',
  iron_cap_staff:    '/icons/equipment/weapons/staff.png',
  mithril_staff:     '/icons/equipment/weapons/staff.png',
  crystal_staff:     '/icons/equipment/weapons/staff.png',
  void_staff:        '/icons/equipment/weapons/staff.png',

  // Tools   — drop PNGs into /icons/equipment/tools/
  // Armor   — drop PNGs into /icons/equipment/armor/

  // ── Misc ─────────────────────────────────────────────────────────────────
  coin:              '/icons/resources/misc/coin.png',
};

export function getResourceIconPath(itemName: string): string | null {
  return ITEM_ICON_MAP[itemName] ?? null;
}

/** Resource type + tier for material items. Returns null for equipment/misc. */
const RESOURCE_INFO_MAP: Record<string, { type: string; tier: number }> = {
  // Wood — raw
  oak_log: { type: 'Wood', tier: 1 }, birch_log: { type: 'Wood', tier: 2 },
  pine_log: { type: 'Wood', tier: 2 }, hardwood_log: { type: 'Wood', tier: 3 },
  mahogany_log: { type: 'Wood', tier: 3 }, crystalwood_log: { type: 'Wood', tier: 4 },
  ebony_log: { type: 'Wood', tier: 4 }, voidwood_log: { type: 'Wood', tier: 5 },
  // Wood — refined
  oak_plank: { type: 'Wood', tier: 1 }, birch_plank: { type: 'Wood', tier: 2 },
  pine_plank: { type: 'Wood', tier: 2 }, mahogany_plank: { type: 'Wood', tier: 3 },
  ebony_plank: { type: 'Wood', tier: 4 }, voidwood_plank: { type: 'Wood', tier: 5 },
  // Stone — raw
  limestone: { type: 'Stone', tier: 1 }, granite: { type: 'Stone', tier: 2 },
  slate: { type: 'Stone', tier: 3 }, marble: { type: 'Stone', tier: 4 },
  obsidian_stone: { type: 'Stone', tier: 5 },
  // Stone — refined
  limestone_block: { type: 'Stone', tier: 1 }, granite_block: { type: 'Stone', tier: 2 },
  slate_slab: { type: 'Stone', tier: 3 }, marble_block: { type: 'Stone', tier: 4 },
  obsidian_block: { type: 'Stone', tier: 5 },
  // Metal — raw
  copper_ore: { type: 'Metal', tier: 1 }, iron_ore: { type: 'Metal', tier: 2 },
  silver_ore: { type: 'Metal', tier: 3 }, mithril_ore: { type: 'Metal', tier: 4 },
  void_ore: { type: 'Metal', tier: 5 },
  // Metal — refined
  copper_ingot: { type: 'Metal', tier: 1 }, iron_ingot: { type: 'Metal', tier: 2 },
  silver_ingot: { type: 'Metal', tier: 3 }, mithril_ingot: { type: 'Metal', tier: 4 },
  void_ingot: { type: 'Metal', tier: 5 },
  // Hide — raw
  hide: { type: 'Hide', tier: 1 }, rodent_hide: { type: 'Hide', tier: 1 },
  rabbit_hide: { type: 'Hide', tier: 1 }, wolf_pelt: { type: 'Hide', tier: 2 },
  bear_pelt: { type: 'Hide', tier: 3 }, troll_hide: { type: 'Hide', tier: 3 },
  drake_scale: { type: 'Hide', tier: 4 }, shadow_hide: { type: 'Hide', tier: 5 },
  // Hide — refined
  basic_leather: { type: 'Hide', tier: 1 }, leather: { type: 'Hide', tier: 2 },
  thick_leather: { type: 'Hide', tier: 3 }, cured_leather: { type: 'Hide', tier: 4 },
  shadow_leather: { type: 'Hide', tier: 5 },
  // Fiber — raw
  cotton_fiber: { type: 'Fiber', tier: 1 }, silk_thread: { type: 'Fiber', tier: 2 },
  velvet_fiber: { type: 'Fiber', tier: 3 }, starweave_fiber: { type: 'Fiber', tier: 4 },
  void_silk: { type: 'Fiber', tier: 5 },
  // Fiber — refined
  cotton_cloth: { type: 'Fiber', tier: 1 }, silk_cloth: { type: 'Fiber', tier: 2 },
  velvet_cloth: { type: 'Fiber', tier: 3 }, starweave_cloth: { type: 'Fiber', tier: 4 },
  void_cloth: { type: 'Fiber', tier: 5 }, tattered_cloth: { type: 'Fiber', tier: 1 },
};

export function getResourceInfo(itemName: string): { type: string; tier: number } | null {
  return RESOURCE_INFO_MAP[itemName] ?? null;
}
