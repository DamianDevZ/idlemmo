// ─── Primitive domain types ───────────────────────────────────────────────────

export type AttributeName =
  | 'vigor'
  | 'endurance'
  | 'strength'
  | 'dexterity'
  | 'intelligence'
  | 'faith'
  | 'arcane';

export type SkillCategoryName = 'gathering' | 'refining' | 'crafting' | 'usage';

export type BiomeName =
  | 'forest'
  | 'mountains'
  | 'swamp'
  | 'desert'
  | 'ruins'
  | 'ocean'
  | 'volcanic';

export type FocusType = 'resources' | 'enemies' | 'balanced' | 'treasure';

export type ItemType = 'material' | 'tool' | 'weapon' | 'armor' | 'consumable' | 'misc' | 'special_attack';

export type DamageType = 'slash' | 'blunt' | 'bleed' | 'pierce' | 'fire' | 'ice' | 'lightning' | 'poison' | 'true';

export type ScalingAttr = 'str' | 'dex' | 'int';

export type ItemRating = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ArmorPresetId =
  | 'unarmored' | 'leather' | 'plate' | 'chainmail' | 'cloth'
  | 'stone_hide' | 'beast_fur' | 'scaled' | 'undead' | 'arcane_shell';

export type EquipmentSlot =
  | 'weapon'
  | 'offhand'
  | 'head'
  | 'chest'
  | 'legs'
  | 'hands'
  | 'feet'
  | 'ring'
  | 'amulet'
  | 'tool_axe'
  | 'tool_pickaxe'
  | 'tool_sickle'
  | 'tool_knife'
  | 'tool_hammer';

export type ExplorationStatus = 'active' | 'paused' | 'completed' | 'died';

export type CollectPreference = 'always' | 'never' | 'if_space';

export type EventType =
  | 'resource_found'
  | 'enemy_encountered'
  | 'combat_result'
  | 'flee_result'
  | 'player_encountered'
  | 'treasure_found'
  | 'recipe_found'
  | 'level_up'
  | 'collect_prompt'
  | 'session_ended'
  | 'campsite_reached';

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

export type ArenaMatchStatus = 'pending' | 'in_progress' | 'completed';

export type WorldBossStatus = 'scheduled' | 'queuing' | 'in_progress' | 'completed';

// ─── Database row types (snake_case mirrors Supabase columns) ─────────────────

export interface DbCharacter {
  id: string;
  user_id: string;
  name: string;
  main_level: number;
  main_xp: number;
  skill_points_available: number;
  current_hp: number;
  current_stamina: number;
  stash_slots: number;
  created_at: string;
  updated_at: string;
}

export interface DbCharacterAttributes {
  character_id: string;
  vigor: number;
  endurance: number;
  strength: number;
  dexterity: number;
  intelligence: number;
  faith: number;
  arcane: number;
}

export interface DbSkillCategory {
  id: string;
  name: SkillCategoryName;
  display_name: string;
  icon: string;
}

export interface DbSkill {
  id: string;
  category_id: string;
  name: string;
  display_name: string;
  description: string;
  /** Which attribute primarily drives this skill's speed/effectiveness */
  primary_attribute: AttributeName;
}

export interface DbCharacterSkill {
  character_id: string;
  skill_id: string;
  level: number;
  xp_toward_next_level: number;
}

export interface DbCharacterCategoryPoints {
  character_id: string;
  category_id: string;
  points_available: number;
  points_total_earned: number;
  xp_current: number;
}

export interface DbBiome {
  id: string;
  name: BiomeName;
  display_name: string;
  description: string;
  icon: string;
}

export interface DbBiomeTier {
  id: string;
  biome_id: string;
  tier: number;
  display_name: string;
  description: string;
  required_skill_level: number;
  required_tool_tier: number;
  /** JSON: { stat: AttributeName, value: number } | null */
  required_attribute: { stat: AttributeName; value: number } | null;
  enemy_level_min: number;
  enemy_level_max: number;
}

export interface DbItemDefinition {
  id: string;
  name: string;
  display_name: string;
  type: ItemType;
  rarity: ItemRarity;
  description: string;
  /** Legacy JSON blob. New fields use dedicated columns below. */
  stats: Record<string, number>;
  equipment_tier: number | null;
  stackable: boolean;
  image_url: string | null;
  // Combat fields (weapons)
  primary_damage_type: DamageType | null;
  base_damage: number | null;
  primary_scaling_attr: ScalingAttr | null;
  primary_scaling_grade: ItemRating | null;
  secondary_scaling_attr: ScalingAttr | null;
  secondary_scaling_grade: ItemRating | null;
  // Defense fields (armor)
  base_defense: number | null;
  material_type: 'metal' | 'leather' | 'cloth' | null;
}

export interface DbInventoryItem {
  instance_id: string;
  character_id: string;
  item_id: string;
  quantity: number;
  equipped_slot: EquipmentSlot | null;
  item_rating: ItemRating | null;
  tier: number;
}

export interface DbStashItem {
  instance_id: string;
  character_id: string;
  item_id: string;
  quantity: number;
  item_rating: ItemRating | null;
  tier: number;
}

export interface DbArmorPreset {
  id: ArmorPresetId;
  display_name: string;
  material_type: 'metal' | 'leather' | 'cloth' | 'none';
  resistances: Record<DamageType, number>;
}

export interface DbExplorationSession {
  id: string;
  character_id: string;
  biome_tier_id: string;
  focus_type: FocusType;
  started_at: string;
  last_tick_at: string;
  ends_at: string | null;
  retreat_hp_threshold: number;
  /** JSON: { [itemId]: CollectPreference } */
  collect_preferences: Record<string, CollectPreference>;
  status: ExplorationStatus;
}

export interface DbExplorationEvent {
  id: string;
  session_id: string;
  character_id: string;
  event_type: EventType;
  /** JSON payload — shape depends on event_type */
  data: Record<string, unknown>;
  occurred_at: string;
  acknowledged_at: string | null;
}

export interface DbFriendRequest {
  id: string;
  from_character_id: string;
  to_character_id: string;
  status: FriendRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface DbFriend {
  character_id: string;
  friend_character_id: string;
  created_at: string;
}

export interface DbArenaQueue {
  id: string;
  character_id: string;
  main_level: number;
  queued_at: string;
  expires_at: string;
}

export interface DbArenaMatch {
  id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  combat_log: CombatRound[];
  status: ArenaMatchStatus;
  created_at: string;
  completed_at: string | null;
}

export interface DbWorldBoss {
  id: string;
  biome_id: string;
  tier: number;
  name: string;
  max_hp: number;
  current_hp: number;
  status: WorldBossStatus;
  spawns_at: string;
  queue_closes_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface DbWorldBossParticipant {
  boss_id: string;
  character_id: string;
  damage_dealt: number;
  joined_at: string;
}

export interface DbRecipe {
  id: string;
  display_name: string;
  output_item_id: string;
  output_quantity: number;
  required_skill_id: string;
  required_skill_level: number;
  /** JSON: [{ item_id, quantity }] */
  ingredients: RecipeIngredient[];
  base_success_chance: number;
  craft_time_seconds: number;
}

// ─── Client-side enriched types ───────────────────────────────────────────────

export interface Character extends Omit<DbCharacter, 'user_id'> {
  attributes: DbCharacterAttributes;
  derivedStats: DerivedStats;
}

export interface DerivedStats {
  maxHp: number;
  maxStamina: number;
  carrySlots: number;
  hpRegenPerMin: number;
  /** Offline exploration tick multiplier (how many ticks per session can run offline). */
  offlineTicks: number;
  /** Faith multiplier on consumable effects (e.g. heal_amount × this). */
  faithConsumableMult: number;
  /** Arcane bonus to rare/quality find % while exploring. */
  arcaneExploreLuck: number;
  // Gather
  gatherSpeedDivisor: number;  // tick duration divided by this
  gatherYieldMult: number;
  rareChanceBonus: number;     // percentage points added to base
  // Refine / craft
  refineEfficiencyMult: number;
  craftSuccessBonus: number;   // percentage points
  // Combat — flat bonus added to weapon base (tiered diminishing returns per stat point)
  strDmgBonus: number;
  dexDmgBonus: number;
  intDmgBonus: number;
  attackSpeedMult: number;
  critChance: number;          // %
  critDamageMult: number;
  defenseReduction: number;    // 0–1
}

export interface SkillWithLevel extends DbSkill {
  level: number;
  xpTowardNextLevel: number;
  categoryPoints: {
    available: number;
    totalEarned: number;
    xpCurrent: number;
  };
}

export interface InventoryItemWithDef extends DbInventoryItem {
  item: DbItemDefinition;
}

export interface StashItemWithDef extends DbStashItem {
  item: DbItemDefinition;
}

// ─── Event payload shapes (typed data field on DbExplorationEvent) ─────────

export interface ResourceFoundPayload {
  item_id: string;
  item_name: string;
  quantity: number;
  rarity: ItemRarity;
  collected: boolean | null; // null = awaiting player response
}

export interface EnemyEncounteredPayload {
  enemy_id: string;
  enemy_name: string;
  enemy_level: number;
  combat_log: CombatRound[];
  outcome: 'victory' | 'defeat' | 'fled';
  loot: { item_id: string; item_name: string; quantity: number }[];
  xp_gained: number;
}

export interface PlayerEncounteredPayload {
  other_character_id: string;
  other_character_name: string;
  other_character_level: number;
  response: 'pending' | 'friend_added' | 'ignored';
}

export interface TreasureFoundPayload {
  items: { item_id: string; item_name: string; quantity: number; rarity: ItemRarity }[];
}

export interface LevelUpPayload {
  type: 'main_level' | 'skill_level' | 'category_points';
  newLevel?: number;
  skillName?: string;
  pointsGained?: number;
}

// ─── Combat ───────────────────────────────────────────────────────────────────

export interface CombatRound {
  round: number;
  attackerName: string;
  defenderName: string;
  rawDamage: number;
  damageAfterDefense: number;
  isCrit: boolean;
  defenderHpAfter: number;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export interface RecipeIngredient {
  item_id: string;
  quantity: number;
}

export interface TierGate {
  tier: number;
  requiredSkillLevel: number;
  requiredToolTier: number;
  requiredAttribute: { stat: AttributeName; value: number } | null;
}
