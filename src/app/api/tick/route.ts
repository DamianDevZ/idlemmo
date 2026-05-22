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

    // Grab active session
    const { data: session } = await supabase
      .from('exploration_sessions')
      .select('*')
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

    // All sessions now use the area system.
    const sessionAreaId: string = (session as { area_id: string }).area_id;
    const sessionAreaTier: number = (session as { area_tier?: number | null }).area_tier ?? 1;

    const [{ data: areaLoot }, { data: areaEnemyRows }] = await Promise.all([
      supabase
        .from('area_tier_loot')
        .select('weight, quantity_min, quantity_max, required_skill_name, item_tier, item_definitions(name, display_name, image_url)')
        .eq('area_id', sessionAreaId)
        .eq('tier', sessionAreaTier),
      supabase
        .from('area_tier_enemies')
        .select('weight')
        .eq('area_id', sessionAreaId)
        .eq('tier', sessionAreaTier),
    ]);
    const areaEnemyWeight = ((areaEnemyRows ?? []) as { weight: number }[])
      .reduce((s, r) => s + (r.weight ?? 0), 0);

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
    // Weights are fully admin-driven via area_tier_loot and area_tier_enemies.
    // Coins are just loot rows in area_tier_loot — no hardcoded treasure event.
    const rChance = ((areaLoot ?? []) as { weight: number }[])
      .reduce((s, r) => s + (r.weight ?? 0), 0);
    const eChance = areaEnemyWeight;
    const total = rChance + eChance;

    let eventType: string;
    if (total === 0) {
      eventType = 'resource_found'; // nothing seeded — returns empty resource
    } else {
      const roll = Math.random() * total;
      eventType = roll < rChance ? 'resource_found' : 'enemy_encountered';
    }

    // ── Build event data ─────────────────────────────────────────────────────
    let eventData: Record<string, unknown> = {};

    if (eventType === 'resource_found') {
      if (areaLoot && areaLoot.length > 0) {
        type AreaLootRow = {
          weight: number; quantity_min: number; quantity_max: number;
          required_skill_name: string | null; item_tier: number | null;
          item_definitions: { name: string; display_name: string; image_url: string | null } | null;
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
          image_url: picked.item_definitions?.image_url ?? null,
          item_tier: itemTier,
          required_tool_tier: Math.max(0, itemTier - 1),
          required_skill: picked.required_skill_name ?? null,
          required_skill_level: SKILL_LEVEL_REQ[itemTier - 1] ?? 0,
        };
      } else {
        // No loot seeded for this area/tier yet
        eventData = { item: 'nothing', quantity: 0 };
      }
    } else if (eventType === 'enemy_encountered') {
      type LootEntry = { item: string; min: number; max: number; weight: number };
      type EnemyRow = {
        weight: number;
        enemies: {
          id: string; display_name: string; base_hp: number; base_attack: number; damage_type: string;
          resistances: Record<string, { value: number; mode: string }> | null;
          tiered_stats: string[] | null;
          enemy_tier_loot: Array<{ weight: number; item_tier: number | null; item_definitions: { name: string } | null }>;
        } | null;
      };

      const { data: areaEnemies } = await supabase
        .from('area_tier_enemies')
        .select(`
          weight,
          enemies(
            id, display_name, base_hp, base_attack, damage_type, resistances, tiered_stats,
            enemy_tier_loot(weight, item_tier, item_definitions(name))
          )
        `)
        .eq('area_id', sessionAreaId)
        .eq('tier', sessionAreaTier);

      const rows = (areaEnemies ?? []) as unknown as EnemyRow[];
      let pickedEnemy: {
        display_name: string; level: number; xp_reward: number;
        base_hp?: number; base_attack?: number; damage_type?: string;
        resistances?: Record<string, { value: number; mode: string }>;
        tiered_stats?: string[]; loot_table: LootEntry[];
      } | null = null;

      if (rows.length > 0) {
        const totalW = rows.reduce((s, r) => s + r.weight, 0);
        let ww = Math.random() * totalW;
        const row = rows.find(r => { ww -= r.weight; return ww <= 0; }) ?? rows[0];
        if (row.enemies) {
          const e = row.enemies;
          const level = sessionAreaTier * 3;
          const lootTable: LootEntry[] = (e.enemy_tier_loot ?? [])
            .filter(l => l.item_definitions)
            .map(l => ({ item: l.item_definitions!.name, min: 1, max: 1, weight: l.weight }));
          pickedEnemy = {
            display_name: e.display_name, level, xp_reward: 10 + level * 3,
            base_hp: e.base_hp, base_attack: e.base_attack, damage_type: e.damage_type,
            resistances: e.resistances ?? {}, tiered_stats: e.tiered_stats ?? [],
            loot_table: lootTable,
          };
        }
      }

      if (pickedEnemy) {
        eventData = {
          enemy:        pickedEnemy.display_name,
          level:        pickedEnemy.level,
          xp_reward:    pickedEnemy.xp_reward,
          base_hp:      pickedEnemy.base_hp,
          base_attack:  pickedEnemy.base_attack,
          damage_type:  pickedEnemy.damage_type,
          resistances:  pickedEnemy.resistances ?? {},
          tiered_stats: pickedEnemy.tiered_stats ?? [],
          loot_table:   pickedEnemy.loot_table ?? [],
        };
      } else {
        // Should not happen: eChance is 0 when no enemies are configured, so
        // enemy_encountered is excluded from the event pool. This is just a safety
        // net for the rare race where the last enemy was deleted between the count
        // check and this query.
        eventType = 'resource_found';
        eventData = { item: 'nothing', quantity: 0 };
      }
    } else {
      // Fallback: nothing configured
      eventData = { item: 'nothing', quantity: 0 };
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
