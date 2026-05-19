import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGameConfig } from '@/lib/game/getGameConfig';

// item_name → generic display name (resource type, not material variant).
// Using generic names keeps the event feed readable regardless of tier.
const ITEM_DISPLAY: Record<string, string> = {
  // Wood
  oak_log: 'Log',         birch_log: 'Log',         mahogany_log: 'Log',
  ebony_log: 'Log',       voidwood_log: 'Log',
  // Stone
  limestone: 'Stone',     granite: 'Stone',          slate: 'Stone',
  marble: 'Stone',        obsidian_stone: 'Stone',
  // Ore
  copper_ore: 'Ore',      iron_ore: 'Ore',           silver_ore: 'Ore',
  mithril_ore: 'Ore',     void_ore: 'Ore',
  // Hide
  rabbit_hide: 'Hide',    wolf_pelt: 'Hide',         bear_pelt: 'Hide',
  drake_scale: 'Hide',    shadow_hide: 'Hide',
  // Fiber
  cotton_fiber: 'Fiber',  silk_thread: 'Fiber',      velvet_fiber: 'Fiber',
  starweave_fiber: 'Fiber', void_silk: 'Fiber',
  // Other
  raw_fish: 'Fish',       coin: 'Coin',
};

function itemDisplayName(itemName: string): string {
  return ITEM_DISPLAY[itemName] ?? itemName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Recipe drop system ───────────────────────────────────────────────────────
// Each tick: 5% chance of a recipe drop.
//   • 2/3 → tool recipe, type weighted by this biome's resource profile
//   • 1/3 → weapon or armor (50/50), then 1/3 each: melee / archer / mage

// Per-biome resource type weights — mirrors biome_tier_resources spawn_weight.
const BIOME_RESOURCE_WEIGHTS: Record<string, { resource: string; weight: number }[]> = {
  forest:   [{ resource:'wood', weight:50 }, { resource:'hide',  weight:30 }, { resource:'stone',weight:20 }],
  swamp:    [{ resource:'fiber',weight:50 }, { resource:'wood',  weight:30 }, { resource:'hide', weight:20 }],
  mountain: [{ resource:'ore',  weight:60 }, { resource:'stone', weight:25 }, { resource:'fiber',weight:15 }],
  desert:   [{ resource:'hide', weight:50 }, { resource:'fiber', weight:30 }, { resource:'ore',  weight:20 }],
  highland: [{ resource:'stone',weight:55 }, { resource:'ore',   weight:35 }, { resource:'wood', weight:10 }],
  // legacy names kept until any active sessions against old biome names expire
  mountains:[{ resource:'ore',  weight:60 }, { resource:'stone', weight:25 }, { resource:'hide', weight:15 }],
  volcanic: [{ resource:'ore',  weight:60 }, { resource:'stone', weight:40 }],
  ocean:    [{ resource:'fiber',weight:70 }, { resource:'ore',   weight:30 }],
  ruins:    [{ resource:'ore',  weight:50 }, { resource:'stone', weight:50 }],
};

// Resource type → keyword found in matching tool recipe display_name (lowercase match)
const RESOURCE_TOOL_KW: Record<string, string> = {
  wood: 'axe', stone: 'pickaxe', ore: 'hammer', hide: 'knife', fiber: 'sickle',
};

// Combat style → keywords to match against weapon / armor display_name (lowercase)
const COMBAT_STYLE = {
  melee:  { weaponKws: ['sword'],           armorKws: ['plate'] },
  archer: { weaponKws: ['bow', 'recurve'],  armorKws: ['leather'] },
  mage:   { weaponKws: ['staff'],           armorKws: ['robe'] },
} as const;
type CombatStyle = keyof typeof COMBAT_STYLE;

function matchKw(name: string, kws: readonly string[]): boolean {
  const lo = name.toLowerCase();
  return kws.some(k => lo.includes(k));
}

function weightedPickResource(weights: { resource: string; weight: number }[]): string {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const w of weights) { r -= w.weight; if (r <= 0) return w.resource; }
  return weights[weights.length - 1].resource;
}

/**
 * POST /api/tick
 * Body: { characterId: string }
 *
 * Processes one exploration tick for the authenticated user's active session.
 * Called by the ExploreClient on a setInterval — the route enforces the
 * minimum cooldown server-side so double-calls are safely ignored.
 */
export async function POST(req: NextRequest) {
  try {
    const { exploration: EXP } = await getGameConfig();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const body = await req.json() as { characterId?: string };
    const { characterId } = body;
    if (!characterId) return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });

    // Verify ownership
    const { data: character } = await supabase
      .from('characters')
      .select('id, current_hp')
      .eq('id', characterId)
      .eq('user_id', user.id)
      .single();
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Grab active session + biome tier
    const { data: session } = await supabase
      .from('exploration_sessions')
      .select('*, biome_tiers(*, biomes(*))')
      .eq('character_id', characterId)
      .eq('status', 'active')
      .single();
    if (!session) return NextResponse.json({ error: 'No active session' }, { status: 404 });

    // Enforce cooldown — ignore calls that arrive too early (2 s grace allows the
    // client to pre-fire 1.5 s before the countdown ends and still be accepted).
    const lastTick = new Date(session.last_tick_at).getTime();
    const minInterval = EXP.tickIntervalSeconds * 1000;
    const elapsed = Date.now() - lastTick;
    if (elapsed < minInterval - 2000) {
      return NextResponse.json({ skipped: true, nextInMs: minInterval - elapsed });
    }

    // Get available resources — new area system or legacy biome system
    const isAreaSession = !!(session as { area_id?: string | null }).area_id;
    const sessionAreaId: string | null = (session as { area_id?: string | null }).area_id ?? null;
    const sessionAreaTier: number = (session as { area_tier?: number | null }).area_tier ?? 1;

    const { data: biomeResources } = isAreaSession
      ? { data: null }
      : await supabase
          .from('biome_tier_resources')
          .select('item_name, item_tier, base_yield_min, base_yield_max, required_skill_name, spawn_weight')
          .eq('biome_tier_id', session.biome_tier_id);

    const { data: areaLoot } = isAreaSession
      ? await supabase
          .from('area_tier_loot')
          .select('weight, quantity_min, quantity_max, required_skill_name, item_tier, item_definitions(name, display_name)')
          .eq('area_id', sessionAreaId!)
          .eq('tier', sessionAreaTier)
      : { data: null };

    // ── Campsite check ───────────────────────────────────────────────────────
    // Track how many ticks have happened in this session via collect_preferences.
    // Every campsiteEveryTicks ticks, fire a campsite_reached event instead of
    // a regular tick so the player can heal, swap gear, or retreat.
    const prefs = (session.collect_preferences ?? {}) as Record<string, unknown>;
    const prevTickCount = (prefs.tick_count as number | undefined) ?? 0;
    const newTickCount  = prevTickCount + 1;
    const isCampsite    = newTickCount % EXP.campsiteEveryTicks === 0;

    // Always update tick_count (done at end, before return)
    const updatedPrefs = { ...prefs, tick_count: newTickCount };

    if (isCampsite) {
      const { data: campsiteEvent, error: campsiteErr } = await supabase
        .from('exploration_events')
        .insert({
          session_id:   session.id,
          character_id: characterId,
          event_type:   'campsite_reached',
          data:         { currentHp: character.current_hp },
        })
        .select('*')
        .single();
      if (campsiteErr) console.error('[tick] campsite insert failed:', campsiteErr);

      const adminClient = createAdminClient();
      const { error: sesErr1 } = await adminClient
        .from('exploration_sessions')
        .update({ last_tick_at: new Date().toISOString(), collect_preferences: updatedPrefs })
        .eq('id', session.id);
      if (sesErr1) console.error('[tick] campsite session update failed:', sesErr1);

      return NextResponse.json({ ok: true, event: campsiteEvent });
    }

    // ── Event selection ──────────────────────────────────────────────────────
    const biomeTier = session.biome_tiers as {
      tier: number;
      enemy_level_min: number;
      enemy_level_max: number;
      biomes?: { id: string; name: string };
    } | null;
    const biomeTierNumber: number = isAreaSession ? sessionAreaTier : (biomeTier?.tier ?? 1);
    const biomeName: string = isAreaSession ? '' : (biomeTier?.biomes?.name ?? '');

    // Ruins: combat-only biome — no resource gathering, heavier enemy spawns.
    const isRuins = biomeName === 'ruins';
    const rChance = isRuins ? 0.00 : 0.65;
    const eChance = isRuins ? 0.70 : 0.20;
    const tChance = isRuins ? 0.15 : 0.07;
    const total   = rChance + eChance + tChance;

    // Recipe drop: 5% chance per tick.
    // 2/3 → tool (type weighted by biome resources); 1/3 → weapon or armor.
    const RECIPE_DROP_CHANCE = 0.05;
    let pickedRecipe: { id: string; display_name: string; category: string; tier: number } | null = null;
    if (Math.random() < RECIPE_DROP_CHANCE) {
      // Two-query approach: JS client can't use subqueries in filter values.
      const { data: knownRows, error: knownErr } = await supabase
        .from('character_known_recipes')
        .select('recipe_id')
        .eq('character_id', characterId);
      if (knownErr) console.error('[Recipe] known-recipes query error:', knownErr);
      const knownIds = (knownRows ?? []).map(r => r.recipe_id as string);

      // Refining recipes are always available at home — only drop world recipes.
      let recipesQuery = supabase
        .from('recipes')
        .select('id, display_name, category, tier')
        .eq('tier', biomeTierNumber)
        .neq('category', 'refining');
      if (knownIds.length > 0) {
        recipesQuery = recipesQuery.not('id', 'in', `(${knownIds.join(',')})`);
      }
      const { data: unknownRecipes, error: unknownErr } = await recipesQuery;
      if (unknownErr) console.error('[Recipe] unknown-recipes query error:', unknownErr);
      console.log(`[Recipe] tier=${biomeTierNumber} biome=${biomeName} known=${knownIds.length} unknown=${unknownRecipes?.length ?? 0}`);

      if (unknownRecipes && unknownRecipes.length > 0) {
        // Ruins only drops weapon/armor — no tool knowledge gained from a pure combat zone.
        const isTool = !isRuins && Math.random() < 2 / 3;

        if (isTool) {
          // Pick resource type weighted by biome profile → map to tool keyword
          const resourceWeights = BIOME_RESOURCE_WEIGHTS[biomeName] ?? [{ resource: 'ore', weight: 1 }];
          const resourceType = weightedPickResource(resourceWeights);
          const toolKw = RESOURCE_TOOL_KW[resourceType] ?? 'axe';
          const toolPool = unknownRecipes.filter(r => r.category === 'tools' && r.display_name.toLowerCase().includes(toolKw));
          const catFallback = unknownRecipes.filter(r => r.category === 'tools');
          const pool = toolPool.length > 0 ? toolPool : catFallback.length > 0 ? catFallback : unknownRecipes;
          pickedRecipe = pool[Math.floor(Math.random() * pool.length)];
        } else {
          // Weapon or Armor (50/50), then 1/3 per combat style (melee/archer/mage)
          const isWeapon = Math.random() < 0.5;
          const targetCat = isWeapon ? 'weapons' : 'armor';
          const styles = Object.keys(COMBAT_STYLE) as CombatStyle[];
          const style = styles[Math.floor(Math.random() * styles.length)];
          const { weaponKws, armorKws } = COMBAT_STYLE[style];
          const kws = isWeapon ? weaponKws : armorKws;
          const styledPool = unknownRecipes.filter(r => r.category === targetCat && matchKw(r.display_name, kws));
          const catFallback = unknownRecipes.filter(r => r.category === targetCat);
          const pool = styledPool.length > 0 ? styledPool : catFallback.length > 0 ? catFallback : unknownRecipes;
          pickedRecipe = pool[Math.floor(Math.random() * pool.length)];
        }
      }
    }

    const eventType = pickedRecipe
      ? 'recipe_found'
      : (() => {
          const roll = Math.random() * total;
          return roll < rChance ? 'resource_found'
               : roll < rChance + eChance ? 'enemy_encountered'
               : 'treasure_found';
        })();

    // ── Build event data ─────────────────────────────────────────────────────
    let eventData: Record<string, unknown> = {};

    if (eventType === 'resource_found') {
      // ── New area system ──────────────────────────────────────────────────
      if (isAreaSession && areaLoot && areaLoot.length > 0) {
        type AreaLootRow = {
          weight: number; quantity_min: number; quantity_max: number;
          required_skill_name: string | null; item_tier: number | null;
          item_definitions: { name: string; display_name: string } | null;
        };
        const rows = areaLoot as unknown as AreaLootRow[];
        const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
        let w = Math.random() * totalWeight;
        const picked = rows.find(r => { w -= r.weight; return w <= 0; }) ?? rows[0];
        const itemName = picked.item_definitions?.name ?? 'unknown';
        const qty = Math.round(Math.random() * (picked.quantity_max - picked.quantity_min) + picked.quantity_min);
        const itemTier = picked.item_tier ?? 1;
        const SKILL_LEVEL_REQ = [0, 15, 30, 50, 70];
        eventData = {
          item: itemName,
          quantity: qty,
          display_name: picked.item_definitions?.display_name ?? itemDisplayName(itemName),
          item_tier: itemTier,
          required_tool_tier: Math.max(0, itemTier - 1),
          required_skill: picked.required_skill_name ?? null,
          required_skill_level: SKILL_LEVEL_REQ[itemTier - 1] ?? 0,
        };
      // ── Legacy biome system ──────────────────────────────────────────────
      } else if (biomeResources && biomeResources.length > 0) {
        // Weighted random pick
        const totalWeight = biomeResources.reduce((s, r) => s + (r.spawn_weight ?? 10), 0);
        let w = Math.random() * totalWeight;
        const picked = biomeResources.find(r => { w -= r.spawn_weight ?? 10; return w <= 0; })
          ?? biomeResources[0];
        const qty = Math.round(
          Math.random() * (picked.base_yield_max - picked.base_yield_min) + picked.base_yield_min
        );
        const displayName = itemDisplayName(picked.item_name);
        const itemTier: number = (picked as { item_tier?: number }).item_tier ?? 1;
        const requiredToolTier = Math.max(0, itemTier - 1);
        const SKILL_LEVEL_REQ = [0, 15, 30, 50, 70];
        const requiredSkillLevel = SKILL_LEVEL_REQ[itemTier - 1] ?? 0;
        eventData = {
          item: picked.item_name,
          quantity: qty,
          display_name: displayName,
          item_tier: itemTier,
          required_tool_tier: requiredToolTier,
          required_skill: (picked as { required_skill_name?: string }).required_skill_name ?? null,
          required_skill_level: requiredSkillLevel,
        };
        // NOTE: inventory write happens when player clicks "Collect" (actOnExploreEvent action)
      } else {
        // No resources seeded for this biome tier
        eventData = { item: 'nothing', quantity: 0 };
      }
    } else if (eventType === 'enemy_encountered') {
      type LootEntry = { item: string; min: number; max: number; weight: number };
      let pickedEnemy: {
        display_name: string;
        level: number;
        xp_reward: number;
        base_hp?: number;
        base_attack?: number;
        damage_type?: string;
        resistances?: Record<string, { value: number; mode: string }>;
        loot_table: LootEntry[];
      } | null = null;

      // ── New area system ──────────────────────────────────────────────────
      if (isAreaSession) {
        const { data: areaEnemies } = await supabase
          .from('area_tier_enemies')
          .select(`
            weight,
            enemies(
              id, display_name, base_hp, base_attack, damage_type, resistances,
              enemy_tier_loot(weight, item_tier, item_definitions(name))
            )
          `)
          .eq('area_id', sessionAreaId!)
          .eq('tier', sessionAreaTier);

        type EnemyRow = {
          weight: number;
          enemies: {
            id: string; display_name: string; base_hp: number; base_attack: number; damage_type: string;
            resistances: Record<string, { value: number; mode: string }> | null;
            enemy_tier_loot: Array<{ weight: number; item_tier: number | null; item_definitions: { name: string } | null }>;
          } | null;
        };
        const rows = (areaEnemies ?? []) as unknown as EnemyRow[];
        if (rows.length > 0) {
          const totalW = rows.reduce((s, r) => s + r.weight, 0);
          let ww = Math.random() * totalW;
          const row = rows.find(r => { ww -= r.weight; return ww <= 0; }) ?? rows[0];
          if (row.enemies) {
            const e = row.enemies;
            const level = sessionAreaTier * 3;
            const lootTable: LootEntry[] = (e.enemy_tier_loot ?? [])
              .filter(l => l.item_definitions)
              .map(l => ({
                item: l.item_definitions!.name,
                min: 1, max: 1,
                weight: l.weight,
              }));
            pickedEnemy = {
              display_name: e.display_name,
              level,
              xp_reward: 10 + level * 3,
              base_hp: e.base_hp,
              base_attack: e.base_attack,
              damage_type: e.damage_type,
              resistances: e.resistances ?? {},
              loot_table: lootTable,
            };
          }
        }
      }

      // ── Legacy biome system ──────────────────────────────────────────────
      if (!pickedEnemy && !isAreaSession) {
        const biomeId = biomeTier?.biomes?.id;
        if (biomeId) {
          const { data: enemyTypes } = await supabase
            .from('enemy_types')
            .select('display_name, level, xp_reward, loot_table')
            .eq('tier', biomeTierNumber)
            .eq('biome_id', biomeId);
          if (enemyTypes && enemyTypes.length > 0) {
            pickedEnemy = enemyTypes[Math.floor(Math.random() * enemyTypes.length)] as {
              display_name: string; level: number; xp_reward: number;
              loot_table: LootEntry[];
            };
          }
        }
      }

      if (pickedEnemy) {
        eventData = {
          enemy:       pickedEnemy.display_name,
          level:       pickedEnemy.level,
          xp_reward:   pickedEnemy.xp_reward,
          base_hp:     pickedEnemy.base_hp,
          base_attack: pickedEnemy.base_attack,
          damage_type: pickedEnemy.damage_type,
          resistances: pickedEnemy.resistances ?? {},
          loot_table:  pickedEnemy.loot_table ?? [],
        };
      } else {
        // No enemies configured for this area/tier — fall back to generic
        const level = isAreaSession
          ? sessionAreaTier * 3
          : (() => {
              const minLv = biomeTier?.enemy_level_min ?? 1;
              const maxLv = biomeTier?.enemy_level_max ?? 5;
              return Math.floor(Math.random() * (maxLv - minLv + 1)) + minLv;
            })();
        eventData = { enemy: `Lv ${level} Creature`, level, xp_reward: 10 + level * 3, loot_table: [] };
      }
    } else if (eventType === 'recipe_found' && pickedRecipe) {
      // Upsert so a duplicate-key race condition never silently swallows the insert.
      // ignoreDuplicates=true means: if they somehow already know it, just skip.
      const { error: insertErr } = await supabase.from('character_known_recipes').upsert({
        character_id: characterId,
        recipe_id:    pickedRecipe.id,
      }, { onConflict: 'character_id,recipe_id', ignoreDuplicates: true });
      if (insertErr) console.error('[Recipe] insert error:', insertErr);
      eventData = {
        recipe_id:    pickedRecipe.id,
        recipe_name:  pickedRecipe.display_name,
        category:     pickedRecipe.category,
        tier:         pickedRecipe.tier,
      };
    } else {
      // treasure_found — auto-collect gold immediately (no decision needed)
      const gold = Math.floor(Math.random() * 25) + 5;
      eventData = { gold };
      await supabase.rpc('add_to_inventory', {
        p_character_id: characterId,
        p_item_name:    'coin',
        p_quantity:     gold,
      });
    }

    // Insert the main event and return the full row (id + occurred_at needed client-side)
    const { data: insertedEvent } = await supabase
      .from('exploration_events')
      .insert({
        session_id:   session.id,
        character_id: characterId,
        event_type:   eventType,
        data:         eventData,
      })
      .select('*')
      .single();

    // Update last_tick_at and tick_count via admin client to guarantee persistence.
    const adminClient = createAdminClient();
    const { error: sesErr } = await adminClient
      .from('exploration_sessions')
      .update({ last_tick_at: new Date().toISOString(), collect_preferences: updatedPrefs })
      .eq('id', session.id);
    if (sesErr) console.error('[tick] session update failed:', sesErr);

    return NextResponse.json({ ok: true, event: insertedEvent });
  } catch (err: unknown) {
    console.error('[tick]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
