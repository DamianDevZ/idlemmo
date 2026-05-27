import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { LogicTree } from './LogicTree';
import type {
  AreaLogic, CraftGroup, RefineGroup, MasteryCat,
  LootEntry, EnemyEntry, IngredientEntry,
} from './LogicTree';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Logic Overview — Admin' };

type RawItem     = { id: string; name: string; display_name: string; type: string; is_tiered: boolean };
type RawRecipe   = { id: string; tier: number; output_item_id: string; output_quantity: number; ingredients: unknown; required_skill_id: string | null; category: string | null };
type RawArea     = { id: string; display_name: string; icon: string; sort_order: number };
type RawLoot     = { area_id: string; tier: number; item_id: string; item_tier: number | null; weight: number };
type RawEnemy    = { id: string; display_name: string; icon: string };
type RawSpawn    = { area_id: string; tier: number; enemy_id: string; weight: number };
type RawSkill    = { id: string; name: string; display_name: string; category: string };
type IngRaw      = { item_id?: string; name?: string; quantity: number };

export default async function LogicPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [areasRes, lootRes, spawnRes, enemiesRes, recipesRes, itemsRes, skillsRes] = await Promise.all([
    db.from('areas').select('id, display_name, icon, sort_order').order('sort_order'),
    db.from('area_tier_loot').select('area_id, tier, item_id, item_tier, weight')
      .order('tier').order('weight', { ascending: false }),
    db.from('area_tier_enemies').select('area_id, tier, enemy_id, weight')
      .order('tier').order('weight', { ascending: false }),
    db.from('enemies').select('id, display_name, icon'),
    db.from('recipes').select('id, tier, output_item_id, output_quantity, ingredients, required_skill_id, category')
      .order('tier'),
    db.from('item_definitions').select('id, name, display_name, type, is_tiered').order('display_name'),
    db.from('skills').select('id, name, display_name, category'),
  ]);

  const areas   = (areasRes.data   ?? []) as RawArea[];
  const loot    = (lootRes.data    ?? []) as RawLoot[];
  const spawns  = (spawnRes.data   ?? []) as RawSpawn[];
  const enemies = (enemiesRes.data ?? []) as RawEnemy[];
  const recipes = (recipesRes.data ?? []) as RawRecipe[];
  const items   = (itemsRes.data   ?? []) as RawItem[];
  const skills  = (skillsRes.data  ?? []) as RawSkill[];

  // Lookup maps
  const itemById   = new Map(items.map(i => [i.id, i]));
  const itemByName = new Map(items.map(i => [i.name, i]));
  const enemyById  = new Map(enemies.map(e => [e.id, e]));

  /** Resolve ingredient item_ids/names to display names. */
  function resolveIngredients(raw: unknown): IngredientEntry[] {
    if (!Array.isArray(raw)) return [];
    return (raw as IngRaw[]).map(ing => {
      const found = ing.item_id ? itemById.get(ing.item_id) : (ing.name ? itemByName.get(ing.name) : undefined);
      return { display_name: found?.display_name ?? ing.name ?? ing.item_id ?? '?', quantity: ing.quantity };
    });
  }

  // ── Exploration ───────────────────────────────────────────────────────────

  const areaLogic: AreaLogic[] = areas.map(area => {
    const tierMap = new Map<number, { loot: LootEntry[]; enemies: EnemyEntry[] }>();

    for (const row of loot.filter(r => r.area_id === area.id)) {
      if (!tierMap.has(row.tier)) tierMap.set(row.tier, { loot: [], enemies: [] });
      tierMap.get(row.tier)!.loot.push({
        item_id:      row.item_id,
        display_name: itemById.get(row.item_id)?.display_name ?? row.item_id,
        item_tier:    row.item_tier,
        weight:       row.weight,
      });
    }
    for (const row of spawns.filter(r => r.area_id === area.id)) {
      if (!tierMap.has(row.tier)) tierMap.set(row.tier, { loot: [], enemies: [] });
      const enemy = enemyById.get(row.enemy_id);
      tierMap.get(row.tier)!.enemies.push({
        enemy_id:     row.enemy_id,
        display_name: enemy?.display_name ?? row.enemy_id,
        icon:         enemy?.icon ?? '👹',
        weight:       row.weight,
      });
    }

    return {
      id:           area.id,
      display_name: area.display_name,
      icon:         area.icon,
      tiers:        [...tierMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([tier, data]) => ({ tier, ...data })),
    };
  });

  // ── Crafting ──────────────────────────────────────────────────────────────

  // Crafting recipes: output item is weapon/armor/tool
  const craftRecipes = recipes.filter(r => {
    const out = itemById.get(r.output_item_id);
    return out && ['weapon', 'armor', 'tool'].includes(out.type);
  });

  const recipesByItem = new Map<string, RawRecipe[]>();
  for (const r of craftRecipes) {
    if (!recipesByItem.has(r.output_item_id)) recipesByItem.set(r.output_item_id, []);
    recipesByItem.get(r.output_item_id)!.push(r);
  }

  const craftGroups: CraftGroup[] = (
    [
      { type: 'weapon', label: '⚔️ Weapons' },
      { type: 'armor',  label: '🛡️ Armor'   },
      { type: 'tool',   label: '⛏️ Tools'   },
    ] as const
  ).map(({ type, label }) => ({
    type,
    label,
    items: items
      .filter(i => i.type === type)
      .map(item => {
        const tiers = (recipesByItem.get(item.id) ?? [])
          .sort((a, b) => a.tier - b.tier)
          .map(r => ({
            tier:             r.tier,
            output_quantity:  r.output_quantity,
            ingredients:      resolveIngredients(r.ingredients),
          }));
        return { id: item.id, display_name: item.display_name, has_recipe: tiers.length > 0, tiers };
      }),
  }));

  // ── Refining ──────────────────────────────────────────────────────────────

  const refineRecipes = recipes.filter(r => r.category === 'refining');
  const refineSkills  = skills.filter(s => s.category === 'refining');

  const refineGroups: RefineGroup[] = refineSkills
    .map(skill => ({
      skill_id:      skill.id,
      skill_display: skill.display_name,
      recipes:       refineRecipes
        .filter(r => r.required_skill_id === skill.id)
        .sort((a, b) => a.tier - b.tier)
        .map(r => {
          const out = itemById.get(r.output_item_id);
          return {
            id:              r.id,
            output_item_id:  r.output_item_id,
            display_name:    out?.display_name ?? r.output_item_id,
            tier:            r.tier,
            output_quantity: r.output_quantity,
            ingredients:     resolveIngredients(r.ingredients),
          };
        }),
    }))
    .filter(g => g.recipes.length > 0);

  // ── Mastery config ────────────────────────────────────────────────────────

  const MASTERY_CATS: Omit<MasteryCat, 'items'>[] = [
    { name: 'weapon_mastery',  display: 'Weapon Mastery',  icon: '⚔️', earnedBy: 'Combat (fighting enemies)',   gates: 'Equipping T2+ weapons' },
    { name: 'armor_mastery',   display: 'Armor Mastery',   icon: '🛡️', earnedBy: 'Combat (fighting enemies)',   gates: 'Equipping T2+ armor' },
    { name: 'tool_mastery',    display: 'Tool Mastery',    icon: '⛏️', earnedBy: 'Gathering resources',         gates: 'Equipping T2+ tools' },
    { name: 'weapon_crafting', display: 'Weapon Crafting', icon: '🔨', earnedBy: 'Crafting weapons',            gates: 'Crafting T2+ weapons' },
    { name: 'armor_crafting',  display: 'Armor Crafting',  icon: '🪡', earnedBy: 'Crafting armor',              gates: 'Crafting T2+ armor' },
    { name: 'tool_crafting',   display: 'Tool Crafting',   icon: '⚙️', earnedBy: 'Crafting tools',             gates: 'Crafting T2+ tools' },
    { name: 'refining',        display: 'Refining',        icon: '🔥', earnedBy: 'Refining raw materials',      gates: 'Refining T2+ materials' },
  ];

  const typeForCat: Record<string, string[]> = {
    weapon_mastery:  ['weapon'],
    armor_mastery:   ['armor'],
    tool_mastery:    ['tool'],
    weapon_crafting: ['weapon'],
    armor_crafting:  ['armor'],
    tool_crafting:   ['tool'],
    refining:        ['material'],
  };

  const masteryData: MasteryCat[] = MASTERY_CATS.map(cat => ({
    ...cat,
    items: items
      .filter(i => (typeForCat[cat.name] ?? []).includes(i.type))
      .map(i => ({ id: i.id, display_name: i.display_name })),
  }));

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-body transition-colors">← Admin</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-heading">Logic Overview</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Visual breakdown of all game systems. Click any item or enemy to open its edit page.
      </p>

      <LogicTree
        areaLogic={areaLogic}
        craftGroups={craftGroups}
        refineGroups={refineGroups}
        masteryData={masteryData}
      />
    </div>
  );
}
