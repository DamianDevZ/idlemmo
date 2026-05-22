# Database Audit — IdleMMO

> Generated after migration 065. Updated after migration 067. Use this document to track cleanup decisions.
> Status key: ✅ Active | ⚠️ Legacy | 🔴 Broken | 💀 Dead | 🔮 Future (planned, not implemented)

---

## Table of Contents
1. [Table Inventory](#1-table-inventory)
2. [Critical Broken Items](#2-critical-broken-items)
3. [Duplicate Systems](#3-duplicate-systems)
4. [Orphaned Columns](#4-orphaned-columns)
5. [Functions Audit](#5-functions-audit)
6. [Foreign Key Issues](#6-foreign-key-issues)
7. [Per-Table Notes](#7-per-table-notes)
8. [Cleanup Decisions](#8-cleanup-decisions)

---

## 1. Table Inventory

| Table | Rows | Status | Notes |
|-------|------|--------|-------|
| `characters` | ~4 | ✅ Active | Core entity |
| `character_attributes` | ~4 | ✅ Active | strength, agility, etc. |
| `character_inventory` | 1 | ✅ Active | PK changed 3× (see §3) |
| `character_stash` | 0 | ✅ Active | Same structure as inventory |
| `character_category_points` | ~4 | ✅ Active | New mastery point system |
| `skill_categories` | ~10 | ✅ Active | Used by mastery system |
| `character_item_mastery` | 0 | 🔮 Future | Schema exists, not populated yet |
| `item_definitions` | 12 | ✅ Active | Many stale columns (see §4) |
| `tier_scaling_config` | 40 | ✅ Active | Item tier multipliers |
| `exploration_sessions` | ~5 | ✅ Active | Has BOTH biome_tier_id AND area_id/area_tier |
| `exploration_events` | 1563 | ✅ Active | High-volume event log |
| `game_config` | 89 | ✅ Active | May have stale keys from removed features |
| `areas` | 6 | ✅ Active | New area system |
| `area_tier_loot` | 31 | ✅ Active | New loot table for areas |
| `area_tier_enemies` | 0 | 🔮 Future | Defined but not seeded |
| `biomes` | — | ✅ Dropped | Dropped migration 067 |
| `biome_tiers` | — | ✅ Dropped | Dropped migration 067 |
| `biome_tier_resources` | — | ✅ Dropped | Dropped migration 067 |
| `enemy_types` | — | ✅ Dropped | Dropped migration 067 (CASCADE) |
| `enemies` | 0 | 🔮 Future | New-system enemy table; populate to use area combat |
| `enemy_loot` | — | ✅ Dropped | Dropped migration — 0 code refs |
| `enemy_tier_loot` | 0 | 🔮 Future | Used by area enemy system; awaits enemies data |
| `enemy_tier_loot` | 0 | 💀 Dead | 12 code refs but no data |
| `skills` | 27 | ⚠️ Legacy | Old skill system; mastery system bypasses this |
| `character_skills` | 1 | ⚠️ Legacy | Old skill XP; mastery system uses character_category_points |
| `special_attack_scrolls` | 0 | 🔮 Future | 11 code refs, placeholder only |
| `character_special_attacks` | 0 | 🔮 Future | 3 code refs, placeholder only |
| `recipes` | 0 | 🔮 Future | 102 code refs, crafting not implemented |
| `character_known_recipes` | 0 | 🔮 Future | 4 code refs |
| `world_bosses` | 0 | 🔮 Future | Schema ready, no active boss |
| `world_boss_participants` | 0 | 🔮 Future | 5 code refs |
| `world_boss_events` | — | ✅ Dropped | Dropped migration — 0 code refs |
| `friends` | 0 | 🔮 Future | 18 code refs, social not implemented |
| `friend_requests` | 0 | 🔮 Future | 3 code refs |
| `arena_matches` | 0 | 🔮 Future | 2 code refs |
| `arena_queue` | 0 | 🔮 Future | 4 code refs |
| `arena_ratings` | 0 | 🔮 Future | 1 code ref |
| `app_settings` | 1 | ⚠️ Legacy | Duplicate of `game_config`; unclear split |
| `player_analytics` | 0 | 💀 Dead | 3 code refs; no active writes |
| `armor_presets` | 10 | ⚠️ Legacy | Only used by `enemy_types.armor_preset_id` (legacy) |
| `weapon_types` | 0 | 💀 Dead | 4 code refs; empty table |

---

## 2. Critical Broken Items

### 2.1 `attack_world_boss` — BROKEN ON CONFLICT

The `attack_world_boss` function distributes coin rewards on boss kill using:
```sql
INSERT INTO character_inventory (character_id, item_id, quantity)
VALUES (...)
ON CONFLICT (character_id, item_id)         -- ← WRONG
DO UPDATE SET quantity = character_inventory.quantity + excluded.quantity;
```

**Problem:** Migration 039 changed `character_inventory` PK from `(character_id, item_id)` to `(character_id, item_id, tier)`. The ON CONFLICT clause references the old columns. This causes a runtime error on every boss kill — rewards are never distributed.

**Fix applied (migration ~063):** Rewrote to call `add_to_inventory()` RPC instead of bare INSERT.

---

### 2.2 `add_to_inventory` — FIXED in migration 064 + 065

History of the problem:
- **Migration 004**: PK was `(character_id, item_id)` 
- **Migration 012**: PK changed to `instance_id` (UUID)
- **Migration 039**: PK changed to `(character_id, item_id, tier)`
- **Old overloads** used `ON CONFLICT (character_id, item_id)` or plain `UPDATE ... WHERE equipped_slot IS NULL` — neither referenced `tier`
- Worse: having 3 overloads with the same base parameters caused PostgreSQL to throw `function is not unique` for any 3-param call → **every item collection RPC was silently failing**

**Resolution:**
- Migration 064: Deployed correct 4-param overload `(uuid, text, int DEFAULT 1, int DEFAULT 1)` with `ON CONFLICT (character_id, item_id, tier)`
- Migration 065: Dropped the 2 old broken overloads

**Remaining:** All app call sites still pass only 3 params `{p_character_id, p_item_name, p_quantity}`. This now correctly resolves to the 4-param version (p_tier defaults to 1). **No code changes needed unless tier > 1 items need to be granted.**

---

### 2.3 `start_exploration` — DROPPED (migration 066)

The app already bypassed this RPC — `startExploration()` in `src/features/exploration/actions.ts` inserts directly into `exploration_sessions` with `area_id`/`area_tier`. The RPC was dead code.

**Dropped in migration 066.**

---

### 2.4 `ensure_world_boss` — DROPPED (migration 067)

Was hardwired to `biome_tiers`. Dropped along with biome tables. World boss system will be rebuilt with area-based logic when feature launches.

---

## 3. Duplicate Systems

### 3.1 Dual Exploration Systems — RESOLVED (migrations 066–067)

**Biome system fully removed:**
- Dropped `biomes`, `biome_tiers`, `biome_tier_resources`, `enemy_types` (migration 067)
- Dropped `exploration_sessions.biome_tier_id` (migration 067)
- Dropped `start_exploration` RPC (migration 066)
- Dropped `ensure_world_boss` function (migration 067)
- Removed all biome code paths from `src/app/api/tick/route.ts`

**Area system is now canonical:**
- `areas` → `area_tier_loot` + `area_tier_enemies` → `enemies` + `enemy_tier_loot`
- `exploration_sessions` uses only `area_id` / `area_tier`
- Admin UI manages areas exclusively
- `area_tier_enemies` is still empty — needs enemy seeding before combat events fire

---

### 3.2 Dual Enemy Tables — RESOLVED (migration 067)

`enemy_types` (old) and `enemy_loot` (old) have been dropped. `enemies` + `enemy_tier_loot` are the canonical tables. `area_tier_enemies` already FKs to `enemies`. Needs data seeding.

---

### 3.3 Dual Skill Systems

**Old system (legacy):**
- `skills` table (27 rows) with `category_id` FK to `skill_categories`
- `character_skills` table — stores XP per skill per character

**New mastery system:**
- `skill_categories` — directly assigned points
- `character_category_points` — stores points per category per character
- `character_item_mastery` — future per-item mastery tracking

The new system **bypasses** `skills` and `character_skills` entirely. The `skills` table is kept alive only because:
- `item_definitions.gathering_skill_id` → FK → `skills.id`
- `item_definitions.required_mastery_skill_id` → FK → `skills.id`
- `recipes.required_skill_id` → FK → `skills.id` (recipes has 0 rows)

---

## 4. Orphaned Columns

### 4.1 `character_inventory.instance_id` — UNIQUE INDEX ADDED

- **History:** Was the primary key in migration 012. Replaced as PK in migration 039.
- **Current state:** `uuid NOT NULL DEFAULT gen_random_uuid()` — UNIQUE index added so `bound_instance_id` lookups work safely.
- `character_special_attacks.bound_instance_id` references this conceptually but has **no FK constraint** (special attacks feature is future).
- **Still TODO:** Drop column or add formal FK when special attacks feature launches.

### 4.2 `character_stash.instance_id` — UNIQUE INDEX ADDED

Same situation. UNIQUE index added. Same drop decision pending.

### 4.3 `item_definitions` — Column Audit (Updated)

All columns audited against actual code references (July 2025):

| Column | Status | Notes |
|--------|--------|-------|
| `stats` (jsonb) | ⚠️ Legacy | Queried in `character/page.tsx` but never rendered. Type labeled "Legacy JSON blob". Still in DB queries — leave until code is cleaned up. |
| `tiered_stats` (text[]) | ✅ Active | Used in `admin/grade-weights/page.tsx` to display weapon stat scaling |
| `required_mastery_skill_id` | ✅ Active | Read in `equip-action.ts` to enforce mastery requirement on equip |
| `gathering_skill_id` | ✅ Active | In admin item form and `ItemDefinitionInput` type |
| `consumable_effects` (jsonb) | ✅ Active | Read in `exploration/actions.ts` to process healing items |
| `recipe_for_item_id` (self-FK) | ✅ Active | Used in admin item page to find/link recipe definitions |
| `primary_scaling_attr` | ✅ Active | Queried in grade-weights admin page; used by combat formula display |
| `secondary_scaling_attr` | ✅ Active | Same |
| `compatible_weapon_type_ids` (jsonb) | ✅ Active | Used in `bind-ultimate-action.ts` for special attack scroll compatibility |
| `tool_config` (jsonb) | ✅ Active | Part of admin `ItemDefinitionInput`; admin form sets it |

---

## 5. Functions Audit

| Function | Status | Issue |
|----------|--------|-------|
| `add_to_inventory(uuid, text, int DEFAULT 1, int DEFAULT 1)` | ✅ Fixed | Migration 064+065 — only overload; p_tier defaults to 1 |
| `start_exploration(...)` | ✅ Dropped | Migration 066 — app bypassed with direct insert |
| `end_exploration(...)` | ✅ Active | Simple status update; fine |
| `attack_world_boss(...)` | ✅ Fixed | Rewrote to call `add_to_inventory()` RPC |
| `ensure_world_boss()` | ✅ Dropped | Migration 067 — biome-dependent, dropped with biome tables |
| `join_world_boss(...)` | ⚠️ Review | Depends on world_boss_participants; feature not launched |
| `join_arena_queue(...)` | 🔮 Future | Arena not implemented |
| `leave_arena_queue(...)` | 🔮 Future | Arena not implemented |
| `accept_friend_request(...)` | 🔮 Future | Social not implemented |
| `decline_friend_request(...)` | 🔮 Future | Social not implemented |
| `restore_hp_on_return(...)` | ✅ Active | Called on session end |
| `my_character_id()` | ✅ Active | Auth helper for RLS |
| `set_updated_at()` | ✅ Active | Trigger function |
| `rls_auto_enable()` | ✅ Active | RLS setup helper |

---

## 6. Foreign Key Issues

### Missing ON DELETE CASCADE

These FKs use `NO ACTION` (default) where `CASCADE` would be safer:

| FK | Table | References | Risk |
|----|-------|------------|------|
| `character_skills.character_id` | character_skills | characters | Deleting a character leaves orphaned skill rows |
| `character_skills.skill_id` | character_skills | skills | Deleting a skill leaves orphaned rows |
| `arena_matches.winner_id` / `loser_id` | arena_matches | characters | Deleting a character leaves orphaned match records |


### Missing FK Constraints

| Column | Table | Should reference | Notes |
|--------|-------|-----------------|-------|
| `character_special_attacks.bound_instance_id` | character_special_attacks | character_inventory.instance_id | No FK defined; instance_id isn't even unique |

---

## 7. Per-Table Notes

### `game_config` (89 rows)
Config keys audited. Three stale keys dropped (migration): `end_armor_factor`, `unarmed_base_damage`, `max_combat_rounds` (duplicate of `max_rounds`). `grade_mult_*` keys now wired into `getGameConfig()` and combat formulas.

### `app_settings` (1 row) vs `game_config` (89 rows)
Two separate config stores with unclear split. `app_settings` appears to be a singleton row (one row = global settings). `game_config` is key-value. These should be consolidated or clearly documented.

### `exploration_events` (1563 rows)
High-volume event log. No cleanup/archival policy. Will grow unbounded. Consider adding a retention policy or partitioning by date.

### `enemy_types` (12 rows)
Uses an embedded `loot_table jsonb` column rather than the `enemy_loot` table. `enemy_loot` is therefore dead (0 rows, 0 code refs). The `enemy_types.area_id` column also exists, bridging the legacy table to the new area system — but `area_tier_enemies` (the proper area-enemy join table) references the `enemies` table (0 rows), not `enemy_types`. **The two systems are not connected.**

### `world_boss_events` — DROPPED
Dropped (0 rows, 0 code refs).

### `enemy_loot` — DROPPED
Dropped (0 rows, 0 code refs).

### `player_analytics` (0 rows, 3 code refs)
Analytics table defined but never written to. The 3 code refs are likely reads/display that never show data. Evaluate whether to wire this up or remove.

---

## 8. Cleanup Decisions

Mark decisions here as we go. Destructive changes (DROP TABLE / DROP COLUMN) should each get a migration.

### Completed ✅

- [x] **Fixed `attack_world_boss`** — rewrote to call `add_to_inventory()` RPC
- [x] **Fixed `add_to_inventory`** — migrations 064+065: correct 4-param overload, dropped broken overloads
- [x] **Dropped `world_boss_events`** — 0 rows, 0 code refs
- [x] **Dropped `enemy_loot`** — 0 rows, 0 code refs
- [x] **Added UNIQUE index on `character_inventory.instance_id`** — needed for bound_instance_id lookups
- [x] **Added UNIQUE index on `character_stash.instance_id`** — same
- [x] **Deleted 3 stale `game_config` keys** — `end_armor_factor`, `unarmed_base_damage`, `max_combat_rounds`
- [x] **Wired `grade_mult_*` into combat engine** — `getGameConfig`, `formulas.ts`, tick routes
- [x] **Ended stale biome session** (character 036aa871) — migration
- [x] **Dropped `start_exploration` RPC** — migration 066; app uses direct insert
- [x] **Dropped biome tables** — migration 067: `biomes`, `biome_tiers`, `biome_tier_resources`, `enemy_types`
- [x] **Dropped `exploration_sessions.biome_tier_id`** — migration 067
- [x] **Dropped `ensure_world_boss`** — migration 067 (biome-dependent)
- [x] **Removed biome code from `tick/route.ts`** — area system only; recipe drop removed (recipes table empty)
- [x] **`item_definitions` columns audited** — all remaining columns are actively referenced in code (see §4.3)

### Needs review before acting

- [ ] **`app_settings` vs `game_config`** — pick one and consolidate
- [ ] **Drop `character_inventory.instance_id` / `character_stash.instance_id`** — defer until `character_special_attacks` feature is designed (may need formal FK)

### Architecture decisions required (discuss before touching)

- [ ] **`skills` / `character_skills` cleanup** — old skill system rows still exist. New mastery system bypasses them. `item_definitions` still FKs to `skills` (gathering_skill_id, required_mastery_skill_id). These columns are active — cleanup requires replacing the FK targets.
- [ ] **`enemies` table** — populate with data and seed `area_tier_enemies` to enable combat events in the area system. Until then `enemy_encountered` events always fall back to `nothing`.
- [ ] **`player_analytics`** — 0 rows, 3 code refs. Wire up or remove.

### Future features (do not delete, just noting they're not live)

- `special_attack_scrolls` / `character_special_attacks` — placeholder code exists
- `recipes` / `character_known_recipes` — crafting system placeholder
- `friends` / `friend_requests` — social system placeholder
- `arena_matches` / `arena_queue` / `arena_ratings` — PvP arena placeholder
- `world_bosses` / `world_boss_participants` — boss system exists but no active bosses; rebuild `ensure_world_boss` with area logic
- `character_item_mastery` — per-item mastery tracking, schema ready
- `area_tier_enemies` — seed enemies + area-enemy rows to activate combat in the area system

---

*Last updated: migration 067*
