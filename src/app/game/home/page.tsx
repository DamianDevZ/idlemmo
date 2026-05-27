import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getResourceIconPath, getResourceInfo } from '@/lib/item-icon';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PersistentTabs } from '@/components/ui/PersistentTabs';
import { DepositButton, DepositAllButton } from '@/components/game/DepositButton';
import HomeRefiningPanel from '@/components/game/HomeRefiningPanel';
import HomeCraftingPanel from '@/components/game/HomeCraftingPanel';
import { EquipmentModal } from '@/components/game/EquipmentModal';
import { ItemSprite } from '@/components/game/ItemSprite';
import type { EquippedData, EquipItemData } from '@/components/game/EquipmentPanel';
import type { DbInventoryItem, DbStashItem, DbItemDefinition } from '@/types/game';
import { StashPanel } from '@/components/game/StashPanel';

export const dynamic = 'force-dynamic';

// Strip material-tier words from recipe display names so the card title shows
// the abstract item type ("Shortbow · Tier 1") rather than the material variant
// ("Oak Shortbow"). This keeps the UI tier-focused and avoids redundancy.
const MATERIAL_WORDS = new Set([
  'Oak', 'Birch', 'Pine', 'Mahogany', 'Ebony', 'Crystal', 'Voidwood', 'Crystalwood',
  'Copper', 'Iron', 'Silver', 'Mithril', 'Void', 'Steel', 'Stone',
  'Cotton', 'Silk', 'Velvet', 'Starweave',
  'Basic', 'Crude', 'Apprentice',
  'Cured', 'Thick', 'Shadow',
]);
function formatSlot(slot: string): string {
  return slot.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function stripMaterialPrefix(displayName: string): string {
  const words = displayName.split(' ');
  let i = 0;
  while (i < words.length - 1 && MATERIAL_WORDS.has(words[i])) i++;
  return words.slice(i).join(' ');
}

export default async function HomeBasePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: character } = await supabase
    .from('characters')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!character) redirect('/create-character');

  const [
    { data: inventoryRows },
    { data: stashRows },
    { data: knownRecipeRows },
    { data: refiningRows },
  ] = await Promise.all([
    supabase
      .from('character_inventory')
      .select('*, item_definitions(*)')
      .eq('character_id', character.id)
      .order('quantity', { ascending: false }),
    supabase
      .from('character_stash')
      .select('*, item_definitions(*)')
      .eq('character_id', character.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('character_known_recipes')
      .select('learned_at, recipes(*, item_definitions(id, display_name))') 
      .eq('character_id', character.id)
      .order('learned_at', { ascending: false }),
    supabase
      .from('recipes')
      .select('*, item_definitions!output_item_id(id, name, display_name), skills!required_skill_id(name)')
      .eq('category', 'refining')
      .order('tier'),
  ]);

  const inventory = (inventoryRows ?? []) as (DbInventoryItem & { item_definitions: DbItemDefinition })[];
  const stash = (stashRows ?? []) as (DbStashItem & { item_definitions: DbItemDefinition })[];

  // ── Equipment data for modal ──────────────────────────────────────────────
  const EQUIP_TYPES = new Set(['weapon', 'armor', 'tool']);
  const equippedItems: EquippedData[] = inventory
    .filter(i => i.equipped_slot && i.item_definitions)
    .map(i => ({
      slot:         i.equipped_slot!,
      item_id:      i.item_id,
      display_name: i.item_definitions.display_name,
      name:         i.item_definitions.name,
      type:         i.item_definitions.type,
      stats:        i.item_definitions.stats,
      base_damage:  i.item_definitions.base_damage,
      base_defense: i.item_definitions.base_defense,
      equipment_tier: i.item_definitions.equipment_tier,
      tier:         i.tier ?? 1,
    }));
  const invAvailable: EquipItemData[] = inventory
    .filter(i => !i.equipped_slot && i.item_definitions && EQUIP_TYPES.has(i.item_definitions.type))
    .map(i => ({ ...i.item_definitions, item_id: i.item_id, tier: i.tier ?? 1, source: 'inventory' as const }));
  const stashAvailable: EquipItemData[] = stash
    .filter(s => s.item_definitions && EQUIP_TYPES.has(s.item_definitions.type))
    .map(s => ({ ...s.item_definitions, item_id: s.item_id, tier: s.tier ?? 1, source: 'stash' as const }));
  const equipAvailable: EquipItemData[] = [
    ...invAvailable,
    // Exclude stash entries where an inventory copy of the same item+tier already exists
    ...stashAvailable.filter(s => !invAvailable.some(i => i.item_id === s.item_id && i.tier === s.tier)),
  ];

  // Equipment that lives in inventory (equipped or just held) — shown in Stash tab
  const inventoryEquip = inventory.filter(i => i.item_definitions && EQUIP_TYPES.has(i.item_definitions.type));
  // Non-equipment items that show in the Inventory tab
  const inventoryResources = inventory.filter(i => !i.item_definitions || !EQUIP_TYPES.has(i.item_definitions.type));
  // Combined count for the Stash tab badge
  const stashAndEquipCount = stash.length + inventoryEquip.length;

  type KnownRecipe = {
    id: string;
    display_name: string;
    output_item_id: string;
    output_quantity: number;
    required_skill_level: number;
    ingredients: unknown;
    tier: number;
    category: string;
    item_definitions: { id: string; name?: string; display_name: string } | null;
  };
  const recipeList = ((knownRecipeRows ?? [])
    .map((r: Record<string, unknown>) => r.recipes)
    .filter(Boolean)) as KnownRecipe[];

  const refineList = (refiningRows ?? []) as KnownRecipe[];

  // Resolve ingredient item_ids → name/display_name for UI display
  type RawIngredient = { item_id: string; tier?: number | null; quantity: number };
  const allIngredientIds = [...new Set(
    [...recipeList, ...refineList]
      .flatMap(r => ((r.ingredients as RawIngredient[]) ?? []).map(i => i.item_id))
      .filter(Boolean)
  )];
  const { data: ingItemDefs } = allIngredientIds.length > 0
    ? await supabase.from('item_definitions').select('id, name, display_name').in('id', allIngredientIds)
    : { data: [] };
  const ingItemMap = new Map((ingItemDefs ?? []).map(d => [d.id as string, { name: d.name as string, display_name: d.display_name as string }]));

  // Enrich ingredients with name/display_name for component consumption
  type EnrichedIngredient = { item_id: string; name: string; display_name: string; quantity: number };
  function enrichIngredients(raw: unknown): EnrichedIngredient[] {
    return ((raw as RawIngredient[]) ?? []).map(i => ({
      item_id:      i.item_id,
      name:         ingItemMap.get(i.item_id)?.name ?? i.item_id,
      display_name: ingItemMap.get(i.item_id)?.display_name ?? i.item_id,
      quantity:     i.quantity,
    }));
  }
  const enrichedRecipeList = recipeList.map(r => ({ ...r, ingredients: enrichIngredients(r.ingredients) }));
  const enrichedRefineList = refineList.map(r => ({ ...r, ingredients: enrichIngredients(r.ingredients) }));

  // Fetch per-item mastery tiers so panels can show lock status for T2+ recipes.
  // Crafting: keyed by output item_definition_id + category (weapon_crafting etc.)
  // Refining: keyed by first ingredient item_id in 'refining' category
  const craftOutputItemIds = [...new Set(
    enrichedRecipeList
      .filter(r => r.tier > 1 && ['weapon', 'armor', 'tool'].includes(r.category))
      .map(r => (r.item_definitions as { id: string } | null)?.id)
      .filter((id): id is string => Boolean(id))
  )];
  const refiningIngredientIds = [...new Set(
    enrichedRefineList
      .filter(r => r.tier > 1)
      .map(r => (r.ingredients as EnrichedIngredient[])?.[0]?.item_id)
      .filter((id): id is string => Boolean(id))
  )];
  const masteryItemIds = [...new Set([...craftOutputItemIds, ...refiningIngredientIds])];
  const { data: masteryRows } = masteryItemIds.length > 0
    ? await supabase
        .from('character_item_mastery')
        .select('item_definition_id, category_name, tier')
        .eq('character_id', character.id)
        .in('item_definition_id', masteryItemIds)
    : { data: [] };
  const craftingMasteryMap: Record<string, number> = {};
  const refiningMasteryMap: Record<string, number> = {};
  for (const row of (masteryRows ?? []) as { item_definition_id: string; category_name: string; tier: number }[]) {
    if (row.category_name === 'refining') {
      refiningMasteryMap[row.item_definition_id] = row.tier;
    } else {
      craftingMasteryMap[`${row.item_definition_id}:${row.category_name}`] = row.tier;
    }
  }

  // Combined quantity map (inventory + stash) by item name
  const qtyMap: Record<string, number> = {};
  for (const item of inventory) {
    const name = (item.item_definitions as DbItemDefinition | null)?.name;
    if (name) qtyMap[name] = (qtyMap[name] ?? 0) + (item.quantity ?? 0);
  }
  for (const item of stash) {
    const name = (item.item_definitions as DbItemDefinition | null)?.name;
    if (name) qtyMap[name] = (qtyMap[name] ?? 0) + (item.quantity ?? 0);
  }

  // Group refining recipes by resource type (derived from skill name)
  const SKILL_TO_RESOURCE: Record<string, { label: string; icon: string }> = {
    woodcutting:  { label: 'Wood',   icon: '🪵' },
    smelting:     { label: 'Metal',  icon: '⚙️' },
    stonecutting: { label: 'Stone',  icon: '🪨' },
    tanning:      { label: 'Hide',   icon: '🦌' },
    weaving:      { label: 'Fiber',  icon: '🧵' },
  };
  const RESOURCE_ORDER = ['woodcutting', 'smelting', 'stonecutting', 'tanning', 'weaving'];
  type RefineRecipe = KnownRecipe & { skills: { name: string } | null };
  const refineGroups = RESOURCE_ORDER.map(skillName => ({
    skillName,
    ...( SKILL_TO_RESOURCE[skillName] ?? { label: skillName, icon: '📦' }),
    recipes: (enrichedRefineList as unknown as RefineRecipe[]).filter(
      r => (r.skills as { name: string } | null)?.name === skillName
    ),
  })).filter(g => g.recipes.length > 0);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-2xl font-black text-primary">🏠 Home Base</h2>
        <p className="text-muted-foreground text-sm">Your sanctuary. Rest, craft, and manage your belongings.</p>
      </div>

      <PersistentTabs storageKey="home" defaultValue="inventory">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="inventory" className="gap-1">
            <span className="hidden sm:inline">Inventory</span>
            <span className="sm:hidden">Bag</span>
            {inventoryResources.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{inventoryResources.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="stash" className="gap-1">
            Stash
            {stashAndEquipCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{stashAndEquipCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="refining">Refine</TabsTrigger>
          <TabsTrigger value="crafting">Craft</TabsTrigger>
        </TabsList>

        {/* ── Inventory ── */}
        <TabsContent value="inventory" className="mt-4">
          {inventoryResources.length === 0 ? (
            <EmptyState icon="🎒" message="Your inventory is empty. Head to the Wilds to gather resources." />
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <EquipmentModal
                  characterId={character.id}
                  equipped={equippedItems}
                  available={equipAvailable}
                />
                <DepositAllButton characterId={character.id} />
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {inventoryResources.map(item => {
                  const def = item.item_definitions;
                  const iconPath = getResourceIconPath(def?.name ?? '');
                  const resInfo = getResourceInfo(def?.name ?? '');
                  // Resources → tier text label; everything else → display name
                  const label = resInfo
                    ? `${resInfo.type} T${resInfo.tier}`
                    : (def?.display_name ?? '?');
                  const typeIcon = '📦';
                  const qty = item.quantity ?? 1;
                  const qtyLabel = qty >= 10_000
                    ? `×${(qty / 1000).toFixed(0)}k`
                    : qty > 1 ? `×${qty}` : null;
                  return (
                    <div
                      key={item.item_id}
                      title={def?.display_name ?? ''}
                      className="relative aspect-square rounded-lg border bg-card overflow-hidden border-border"
                    >
                      {/* Icon fills the cell */}
                      <div className="absolute inset-0 flex items-center justify-center p-2 pb-5">
                        {iconPath ? (
                          <img src={iconPath} alt="" className="w-full h-full object-contain" />
                        ) : def?.image_url ? (
                          <img src={def.image_url} alt="" className="w-full h-full object-contain p-[10%]" />
                        ) : (
                          <span className="text-3xl">{typeIcon}</span>
                        )}
                      </div>
                      {/* Quantity — top-right */}
                      {qtyLabel && (
                        <span
                          className="absolute top-1 right-1 text-[11px] tabular-nums font-black text-white leading-none"
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                        >
                          {qtyLabel}
                        </span>
                      )}
                      {/* Bottom strip: name + deposit button */}
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1.5 py-0.5 flex items-center gap-0.5">
                        <p className="text-[10px] text-white/80 leading-tight truncate flex-1">{label}</p>
                        {!item.equipped_slot && (
                          <DepositButton compact characterId={character.id} itemId={item.item_id} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Stash ── */}
        <TabsContent value="stash" className="mt-4">
          {stashAndEquipCount === 0 ? (
            <EmptyState icon="📦" message="Your stash is empty. Deposit items from your inventory to store them safely." />
          ) : (
            <StashPanel
              stash={stash as unknown as Parameters<typeof StashPanel>[0]['stash']}
              inventoryEquip={inventoryEquip as unknown as Parameters<typeof StashPanel>[0]['inventoryEquip']}
              characterId={character.id}
            />
          )}
        </TabsContent>

        {/* ── Refining ── */}
        <TabsContent value="refining" className="mt-4">
          <HomeRefiningPanel
            refineGroups={refineGroups}
            qtyMap={qtyMap}
            characterId={character.id}
            refiningMasteryMap={refiningMasteryMap}
          />
        </TabsContent>

        {/* ── Crafting ── */}
        <TabsContent value="crafting" className="mt-4">
          <HomeCraftingPanel
            recipeList={enrichedRecipeList}
            qtyMap={qtyMap}
            characterId={character.id}
            craftingMasteryMap={craftingMasteryMap}
          />
        </TabsContent>
      </PersistentTabs>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
      <span className="text-4xl">{icon}</span>
      <p className="text-muted-foreground text-sm max-w-xs">{message}</p>
    </div>
  );
}
