-- Game Config: all tunable game constants stored in DB so admins can tweak
-- without a code deploy. Each row is one constant with metadata for the UI.

CREATE TABLE IF NOT EXISTS game_config (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text        NOT NULL,
  sort_order   integer     NOT NULL DEFAULT 0,
  key          text        NOT NULL UNIQUE,
  label        text        NOT NULL,
  description  text,
  value        numeric     NOT NULL,
  default_value numeric    NOT NULL,
  min_value    numeric,
  max_value    numeric,
  step         numeric     NOT NULL DEFAULT 1,
  unit         text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Only service_role can write; authenticated users can read (for future client-side reads)
ALTER TABLE game_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_config_read"  ON game_config FOR SELECT USING (true);
CREATE POLICY "game_config_write" ON game_config FOR ALL USING (auth.role() = 'service_role');

-- ─── Seed: Levelling & XP ──────────────────────────────────────────────────
INSERT INTO game_config (category, sort_order, key, label, description, value, default_value, min_value, max_value, step, unit) VALUES
('levelling', 1, 'xp_base',               'Base XP (Lv 1→2)',          'XP required to advance from level 1 to 2. Each subsequent level multiplies by xpScaling.', 100, 100, 10, 10000, 1, null),
('levelling', 2, 'xp_scaling',            'XP Scaling Factor',         'Multiplicative XP cost increase per level. 1.15 = 15% more XP each level.',               1.15, 1.15, 1.01, 3.0, 0.01, null),
('levelling', 3, 'skill_points_per_level','Skill Points per Level',     'Attribute points awarded each time the character gains a main level.',                    1,    1,    0,    10,   1,    null),
('levelling', 4, 'starting_attribute',    'Starting Attribute Value',   'All attributes start at this value for newly created characters.',                        5,    5,    1,    20,   1,    null),
('levelling', 5, 'creation_bonus_points', 'Creation Bonus Points',      'Free attribute points the player distributes freely at character creation.',               10,   10,   0,    50,   1,    null),

-- ─── HP & Carry ────────────────────────────────────────────────────────────
('hp_carry', 1, 'base_hp',             'Base HP',                  'HP all characters have before Vigor scaling applies.',                          50,   50,   10,  500,  1,    'hp'),
('hp_carry', 2, 'hp_per_vigor',        'HP per Vigor',             'Additional max HP gained per point of Vigor.',                                  15,   15,   1,   100,  1,    'hp'),
('hp_carry', 3, 'base_carry_slots',    'Base Carry Slots',         'Inventory slots before Endurance scaling applies.',                             20,   20,   5,   200,  1,    'slots'),
('hp_carry', 4, 'slots_per_endurance', 'Slots per Endurance',      'Additional carry slots gained per point of Endurance.',                         2,    2,    0,   10,   1,    'slots'),
('hp_carry', 5, 'hp_regen_per_faith',  'HP Regen per Faith',       'HP regenerated per minute out of combat, per point of Faith.',                  0.5,  0.5,  0,   10,   0.1,  'hp/min'),
('hp_carry', 6, 'max_attribute',       'Attribute Hard Cap',       'Maximum value any single attribute can ever reach.',                            99,   99,   10,  999,  1,    null),

-- ─── Attribute → Gathering ─────────────────────────────────────────────────
('gathering', 1, 'dex_gather_speed',  'DEX → Gather Speed Factor', 'Higher = more speed per DEX point. tickMs = base / (1 + DEX × factor).',       0.025, 0.025, 0.001, 0.5, 0.001, null),
('gathering', 2, 'str_gather_yield',  'STR → Gather Yield Factor', 'Higher = more materials per tick. yield = base × (1 + STR × factor).',         0.02,  0.02,  0.001, 0.5, 0.001, null),
('gathering', 3, 'int_refine_factor', 'INT → Refine Efficiency',   'Higher = more refined output. output = base × (1 + INT × factor).',            0.01,  0.01,  0.001, 0.5, 0.001, null),
('gathering', 4, 'faith_craft_bonus', 'Faith → Craft Success',     'craftSuccess% += Faith × this. Reduces craft failure rate per Faith point.',   0.5,   0.5,   0,    5,   0.1,   '%'),
('gathering', 5, 'arcane_rare_factor','Arcane → Rare Drop Bonus',  'rareChance% += Arcane × this. Increases rare quality drop probability.',       0.1,   0.1,   0,    5,   0.01,  '%'),

-- ─── Combat — Damage ──────────────────────────────────────────────────────
('combat_damage', 1, 'str_melee_divisor',  'STR Melee Divisor',    'meleeDmg = base × (1 + STR/divisor). Lower divisor = more damage per STR.',   20,  20,  5,   500, 1,    null),
('combat_damage', 2, 'dex_ranged_divisor', 'DEX Ranged Divisor',   'rangedDmg = base × (1 + DEX/divisor). Lower divisor = more damage per DEX.',  20,  20,  5,   500, 1,    null),
('combat_damage', 3, 'int_magic_divisor',  'INT Magic Divisor',    'magicDmg = base × (1 + INT/divisor). Lower divisor = more damage per INT.',   20,  20,  5,   500, 1,    null),
('combat_damage', 4, 'armor_divisor',      'Armor Divisor',        'defReduction = armor/(armor+divisor). Higher = armor has weaker effect.',      100, 100, 10,  2000, 1,   null),

-- ─── Combat — Speed & Crits ───────────────────────────────────────────────
('combat_speed_crit', 1, 'dex_speed_divisor',     'DEX Attack Speed Divisor', 'speed = base × (1 + DEX/divisor). Lower = faster attacks per DEX.',           25,   25,   5,   200,  1,     null),
('combat_speed_crit', 2, 'dex_crit_factor',        'DEX → Crit Chance Factor', 'critChance% = weaponCrit + DEX × factor. Higher = more crit per DEX.',        0.3,  0.3,  0,   5,    0.01,  '%'),
('combat_speed_crit', 3, 'crit_damage_base',       'Crit Damage Base Mult',    'critMult = base + DEX × factor. Minimum crit damage multiplier.',              1.5,  1.5,  1.0, 10.0, 0.1,   '×'),
('combat_speed_crit', 4, 'dex_crit_damage_factor', 'DEX → Crit Damage Factor', 'critMult += DEX × this. Scales how much each DEX point improves crits.',      0.005,0.005,0,   0.5,  0.001, null),

-- ─── Skill System ──────────────────────────────────────────────────────────
('skills', 1, 'category_xp_per_tick',  'Category XP per Tick',        'XP added to the category pool each time an activity action fires.',              10,   10,   1,    10000, 1,     'xp'),
('skills', 2, 'category_xp_per_point', 'Category XP per Point',       'How much category XP converts to 1 spendable category skill point.',             100,  100,  10,   10000, 1,     'xp'),
('skills', 3, 'speed_factor',          'Speed Bonus per Skill Level',  'tickMs /= (1 + skillLevel × factor). Reduces tick time as skill grows.',          0.04, 0.04, 0,    0.5,   0.001, null),
('skills', 4, 'yield_factor',          'Yield Bonus per Skill Level',  'yield *= (1 + skillLevel × factor). Increases resource yield as skill grows.',    0.03, 0.03, 0,    0.5,   0.001, null),
('skills', 5, 'craft_success_bonus',   'Craft Success per Level',      'craftSuccess% += skillLevel × this. Reduces craft failures at higher levels.',    2,    2,    0,    20,    0.5,   '%'),
('skills', 6, 'rare_find_bonus',       'Rare Find per Level',          'rareChance% += skillLevel × this. Increases rare drops at higher skill.',         0.05, 0.05, 0,    5,     0.01,  '%'),
('skills', 7, 'combat_damage_factor',  'Combat Damage per Skill Level','combatMult = 1 + skillLevel × this. Scales all damage with combat skill level.', 0.02, 0.02, 0,    0.5,   0.001, null),
('skills', 8, 'max_skill_level',       'Max Skill Level Cap',          'Hard ceiling on any individual sub-skill level. Cannot be exceeded.',             99,   99,   10,   999,   1,     null),

-- ─── Exploration — Encounter Chances ──────────────────────────────────────
('exploration', 1, 'tick_interval',           'Tick Interval',              'How often the exploration server tick fires. Matches pg_cron schedule.',      5,    5,    1,   300, 1,    's'),
('exploration', 2, 'base_resource_chance',    'Base Resource Chance',       'Probability of finding a resource node each tick (before focus mult).',       0.70, 0.70, 0,   1,   0.01, null),
('exploration', 3, 'base_enemy_chance',       'Base Enemy Chance',          'Probability of encountering an enemy each tick (before focus mult).',         0.20, 0.20, 0,   1,   0.01, null),
('exploration', 4, 'base_treasure_chance',    'Base Treasure Chance',       'Probability of finding treasure each tick (before focus mult).',              0.05, 0.05, 0,   1,   0.01, null),
('exploration', 5, 'player_encounter_chance', 'Player Encounter Chance',    'Chance per tick of meeting another player in the same biome+tier.',          0.05, 0.05, 0,   1,   0.01, null),
('exploration', 6, 'collect_prompt_timeout',  'Collect Prompt Timeout',     'Seconds before an unanswered collect prompt auto-applies default action.',   30,   30,   5,   300, 1,    's'),

-- ─── Exploration — Focus Multipliers ──────────────────────────────────────
('focus_mults', 1, 'focus_res_resource',      'Resources Focus → Resource',  'Encounter mult for resources when player is on Resources focus.',  1.5, 1.5, 0, 5, 0.1, '×'),
('focus_mults', 2, 'focus_res_enemy',         'Resources Focus → Enemy',     'Encounter mult for enemies when player is on Resources focus.',   0.5, 0.5, 0, 5, 0.1, '×'),
('focus_mults', 3, 'focus_res_treasure',      'Resources Focus → Treasure',  'Encounter mult for treasure when player is on Resources focus.', 0.8, 0.8, 0, 5, 0.1, '×'),
('focus_mults', 4, 'focus_enemy_resource',    'Enemies Focus → Resource',    'Encounter mult for resources when player is on Enemies focus.',  0.3, 0.3, 0, 5, 0.1, '×'),
('focus_mults', 5, 'focus_enemy_enemy',       'Enemies Focus → Enemy',       'Encounter mult for enemies when player is on Enemies focus.',   2.0, 2.0, 0, 5, 0.1, '×'),
('focus_mults', 6, 'focus_enemy_treasure',    'Enemies Focus → Treasure',    'Encounter mult for treasure when player is on Enemies focus.', 0.6, 0.6, 0, 5, 0.1, '×'),
('focus_mults', 7, 'focus_treasure_resource', 'Treasure Focus → Resource',   'Encounter mult for resources when player is on Treasure focus.',0.7, 0.7, 0, 5, 0.1, '×'),
('focus_mults', 8, 'focus_treasure_enemy',    'Treasure Focus → Enemy',      'Encounter mult for enemies when player is on Treasure focus.', 0.8, 0.8, 0, 5, 0.1, '×'),
('focus_mults', 9, 'focus_treasure_treasure', 'Treasure Focus → Treasure',   'Encounter mult for treasure when player is on Treasure focus.',2.0, 2.0, 0, 5, 0.1, '×'),

-- ─── Combat Settings ──────────────────────────────────────────────────────
('combat_settings', 1, 'max_rounds',            'Max Combat Rounds',    'Fight is declared a draw if neither side dies within this many rounds.',      30, 30, 5,  500, 1, 'rounds'),
('combat_settings', 2, 'stamina_cost_per_round','Stamina Cost per Round','Stamina deducted from the attacker each combat round.',                       1,  1,  0,  20,  1, 'stamina'),

-- ─── Death ────────────────────────────────────────────────────────────────
('death', 1, 'item_drop_chance', 'Item Drop Chance on Death', 'Probability that each carried inventory slot is permanently lost on death. 0.10 = 10%.', 0.10, 0.10, 0, 1, 0.01, null),

-- ─── World Boss ───────────────────────────────────────────────────────────
('world_boss', 1, 'spawn_interval_hours',  'Spawn Interval',          'Hours between world boss spawns per biome+tier combination.',                    3,   3,   1,   168, 1,   'hours'),
('world_boss', 2, 'queue_window_seconds',  'Queue Window',             'Seconds the join queue stays open. Fight starts early if maxPlayers reached.',  120, 120, 10,  600, 10,  's'),
('world_boss', 3, 'min_players',           'Min Players',              'Minimum participants required to start the boss fight.',                         2,   2,   1,   20,  1,   'players'),
('world_boss', 4, 'max_players',           'Max Players',              'Maximum concurrent participants in a single boss fight.',                        20,  20,  2,   200, 1,   'players'),
('world_boss', 5, 'boss_hp_multiplier',    'Boss HP Multiplier',       'bossHP = avgPlayerMaxHP × this × playerCount.',                                 10,  10,  1,   500, 1,   '×'),
('world_boss', 6, 'boss_damage_per_player','Boss Damage Per Player',   'Boss damage scaling factor relative to player count (prevents trivial solos).', 0.8, 0.8, 0.1, 10,  0.1, '×'),

-- ─── Arena (PvP) ──────────────────────────────────────────────────────────
('arena', 1, 'queue_timeout_seconds', 'Queue Timeout',          'Seconds before an unmatched arena queue entry is automatically cancelled.', 120, 120, 10,  600, 10, 's'),
('arena', 2, 'matchmaking_range',     'Matchmaking Level Range', 'Players must be within ±N main levels to be matched together.',            5,   5,   1,   50,  1,  'levels'),
('arena', 3, 'points_per_win',        'Points per Win',          'Arena points awarded to the winner.',                                      30,  30,  0,   1000,1,  'pts'),
('arena', 4, 'points_per_loss',       'Points Lost on Defeat',   'Arena points deducted from the loser.',                                    10,  10,  0,   500, 1,  'pts'),

-- ─── Item Rarity Drop Weights ─────────────────────────────────────────────
('rarities', 1, 'weight_common',    'Common Drop Weight',    'Relative weight for Common items. This is the 1.0 baseline all others are measured against.', 1.00, 1.00, 0.01, 10,  0.01,  null),
('rarities', 2, 'weight_uncommon',  'Uncommon Drop Weight',  'Relative weight for Uncommon items vs Common.',                                              0.40, 0.40, 0.001, 5,  0.01,  null),
('rarities', 3, 'weight_rare',      'Rare Drop Weight',      'Relative weight for Rare items.',                                                            0.15, 0.15, 0.001, 2,  0.01,  null),
('rarities', 4, 'weight_epic',      'Epic Drop Weight',      'Relative weight for Epic items.',                                                            0.04, 0.04, 0.001, 1,  0.001, null),
('rarities', 5, 'weight_legendary', 'Legendary Drop Weight', 'Relative weight for Legendary items. 0.01 = 1% as common as a Common item.',                0.01, 0.01, 0.001, 0.5,0.001, null);
