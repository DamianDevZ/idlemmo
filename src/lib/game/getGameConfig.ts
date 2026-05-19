import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { GAME_CONFIG } from '@/config/game.config';

/**
 * Reads game config from the database, falling back to the static
 * GAME_CONFIG values if a key is missing or the DB is unavailable.
 *
 * Cached per-deployment with a 60-second revalidation window.
 * Call revalidateTag('game-config') after an admin save to bust the cache.
 */
export const getGameConfig = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase.from('game_config').select('key, value');
    const f = Object.fromEntries((data ?? []).map(r => [r.key, Number(r.value)]));
    const G = GAME_CONFIG;

    // Helper so the fallback is always explicit
    const v = (key: string, fallback: number) => (key in f ? f[key] : fallback);

    return {
      character: {
        xpToLevelBase:         v('xp_base',               G.character.xpToLevelBase),
        xpScalingFactor:       v('xp_scaling',             G.character.xpScalingFactor),
        skillPointsPerLevel:   v('skill_points_per_level', G.character.skillPointsPerLevel),
        startingMainLevel:     G.character.startingMainLevel,
        startingAttributeValue:v('starting_attribute',     G.character.startingAttributeValue),
        creationBonusPoints:   v('creation_bonus_points',  G.character.creationBonusPoints),
      },
      attributes: {
        maxValue:             v('max_attribute',         G.attributes.maxValue),
        baseHp:               v('base_hp',              G.attributes.baseHp),
        hpPerVigor:           v('hp_per_vigor',         G.attributes.hpPerVigor),
        baseCarrySlots:       v('base_carry_slots',     G.attributes.baseCarrySlots),
        slotsPerEndurance:    v('slots_per_endurance',  G.attributes.slotsPerEndurance),
        hpRegenPerFaith:      v('hp_regen_per_faith',   G.attributes.hpRegenPerFaith),
        dexGatherSpeedFactor: v('dex_gather_speed',     G.attributes.dexGatherSpeedFactor),
        strGatherYieldFactor: v('str_gather_yield',     G.attributes.strGatherYieldFactor),
        intRefineFactor:      v('int_refine_factor',    G.attributes.intRefineFactor),
        faithCraftBonus:      v('faith_craft_bonus',    G.attributes.faithCraftBonus),
        arcaneRareFactor:     v('arcane_rare_factor',   G.attributes.arcaneRareFactor),
        statTier1Rate:        v('stat_tier1_rate',       G.attributes.statTier1Rate),
        statTier2Rate:        v('stat_tier2_rate',       G.attributes.statTier2Rate),
        statTier3Rate:        v('stat_tier3_rate',       G.attributes.statTier3Rate),
        statTier4Rate:        v('stat_tier4_rate',       G.attributes.statTier4Rate),
        statTier1Cap:         v('stat_tier1_cap',        G.attributes.statTier1Cap),
        statTier2Cap:         v('stat_tier2_cap',        G.attributes.statTier2Cap),
        statTier3Cap:         v('stat_tier3_cap',        G.attributes.statTier3Cap),
        dexSpeedDivisor:      v('dex_speed_divisor',    G.attributes.dexSpeedDivisor),
        dexCritFactor:        v('dex_crit_factor',      G.attributes.dexCritFactor),
        critDamageBase:       v('crit_damage_base',     G.attributes.critDamageBase),
        dexCritDamageFactor:  v('dex_crit_damage_factor',G.attributes.dexCritDamageFactor),
        armorDivisor:         v('armor_divisor',        G.attributes.armorDivisor),
      },
      skills: {
        categoryXpPerTick:  v('category_xp_per_tick',  G.skills.categoryXpPerTick),
        categoryXpPerPoint: v('category_xp_per_point', G.skills.categoryXpPerPoint),
        levelCostCycle:     G.skills.levelCostCycle,
        maxSkillLevel:      v('max_skill_level',        G.skills.maxSkillLevel),
        speedFactor:        v('speed_factor',           G.skills.speedFactor),
        yieldFactor:        v('yield_factor',           G.skills.yieldFactor),
        craftSuccessBonus:  v('craft_success_bonus',    G.skills.craftSuccessBonus),
        rareFindBonus:      v('rare_find_bonus',        G.skills.rareFindBonus),
        combatDamageFactor: v('combat_damage_factor',   G.skills.combatDamageFactor),
      },
      exploration: {
        tickIntervalSeconds:          v('tick_interval',           G.exploration.tickIntervalSeconds),
        baseResourceChance:           v('base_resource_chance',    G.exploration.baseResourceChance),
        baseEnemyChance:              v('base_enemy_chance',       G.exploration.baseEnemyChance),
        baseTreasureChance:           v('base_treasure_chance',    G.exploration.baseTreasureChance),
        playerEncounterChance:        v('player_encounter_chance', G.exploration.playerEncounterChance),
        collectPromptTimeoutSeconds:  v('collect_prompt_timeout',  G.exploration.collectPromptTimeoutSeconds),
        playerEncounterTimeoutSeconds:G.exploration.playerEncounterTimeoutSeconds,
        campsiteEveryTicks:           v('campsite_every_ticks',    G.exploration.campsiteEveryTicks),
        focusMultipliers: {
          resources: {
            resource: v('focus_res_resource', G.exploration.focusMultipliers.resources.resource),
            enemy:    v('focus_res_enemy',    G.exploration.focusMultipliers.resources.enemy),
            treasure: v('focus_res_treasure', G.exploration.focusMultipliers.resources.treasure),
          },
          enemies: {
            resource: v('focus_enemy_resource', G.exploration.focusMultipliers.enemies.resource),
            enemy:    v('focus_enemy_enemy',    G.exploration.focusMultipliers.enemies.enemy),
            treasure: v('focus_enemy_treasure', G.exploration.focusMultipliers.enemies.treasure),
          },
          balanced: G.exploration.focusMultipliers.balanced,
          treasure: {
            resource: v('focus_treasure_resource', G.exploration.focusMultipliers.treasure.resource),
            enemy:    v('focus_treasure_enemy',    G.exploration.focusMultipliers.treasure.enemy),
            treasure: v('focus_treasure_treasure', G.exploration.focusMultipliers.treasure.treasure),
          },
        },
      },
      combat: {
        maxRounds:          v('max_rounds',             G.combat.maxRounds),
        staminaCostPerRound:v('stamina_cost_per_round', G.combat.staminaCostPerRound),
      },
      death: {
        itemDropChance: v('item_drop_chance', G.death.itemDropChance),
      },
      homeBase: G.homeBase,
      worldBoss: {
        spawnIntervalHours:  v('spawn_interval_hours',   G.worldBoss.spawnIntervalHours),
        queueWindowSeconds:  v('queue_window_seconds',   G.worldBoss.queueWindowSeconds),
        minPlayers:          v('min_players',            G.worldBoss.minPlayers),
        maxPlayers:          v('max_players',            G.worldBoss.maxPlayers),
        bossHpMultiplier:    v('boss_hp_multiplier',     G.worldBoss.bossHpMultiplier),
        bossDamagePerPlayer: v('boss_damage_per_player', G.worldBoss.bossDamagePerPlayer),
      },
      arena: {
        queueTimeoutSeconds:  v('queue_timeout_seconds', G.arena.queueTimeoutSeconds),
        matchmakingLevelRange:v('matchmaking_range',     G.arena.matchmakingLevelRange),
        pointsPerWin:         v('points_per_win',        G.arena.pointsPerWin),
        pointsPerLoss:        v('points_per_loss',       G.arena.pointsPerLoss),
      },
      tierGates: G.tierGates,
      xpRewards: {
        gatherMainXpPerTier:     v('xp_gather_main_per_tier',   G.xpRewards.gatherMainXpPerTier),
        gatherCatXpPerTier:      v('xp_gather_cat_per_tier',    G.xpRewards.gatherCatXpPerTier),
        combatBaseXp:            v('xp_combat_base',            G.xpRewards.combatBaseXp),
        combatXpPerLevel:        v('xp_combat_per_level',       G.xpRewards.combatXpPerLevel),
        combatUsageCatXpPerLevel:v('xp_combat_usage_per_level', G.xpRewards.combatUsageCatXpPerLevel),
      },
      rarities: {
        common:    { ...G.rarities.common,    dropWeightMult: v('weight_common',    G.rarities.common.dropWeightMult) },
        uncommon:  { ...G.rarities.uncommon,  dropWeightMult: v('weight_uncommon',  G.rarities.uncommon.dropWeightMult) },
        rare:      { ...G.rarities.rare,      dropWeightMult: v('weight_rare',      G.rarities.rare.dropWeightMult) },
        epic:      { ...G.rarities.epic,      dropWeightMult: v('weight_epic',      G.rarities.epic.dropWeightMult) },
        legendary: { ...G.rarities.legendary, dropWeightMult: v('weight_legendary', G.rarities.legendary.dropWeightMult) },
      },
    };
  },
  ['game-config'],
  { tags: ['game-config'], revalidate: 60 }
);

export type LiveGameConfig = Awaited<ReturnType<typeof getGameConfig>>;
