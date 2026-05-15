import { redirect } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { getResourceIconPath, getResourceInfo } from '@/lib/item-icon';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DepositButton, DepositAllButton } from '@/components/game/DepositButton';
import HomeRefiningPanel from '@/components/game/HomeRefiningPanel';
import HomeCraftingPanel from '@/components/game/HomeCraftingPanel';
import { EquipmentModal } from '@/components/game/EquipmentModal';
import type { EquippedData, EquipItemData } from '@/components/game/EquipmentPanel';
import type { DbInventoryItem, DbStashItem, DbItemDefinition } from '@/types/game';

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
function stripMaterialPrefix(displayName: string): string {
  const words = displayName.split(' ');
  let i = 0;
  while (i < words.length - 1 && MATERIAL_WORDS.has(words[i])) i++;
  return words.slice(i).join(' ');
}

const RARITY_COLORS: Record<string, string> = {
  common:    'text-foreground',
  uncommon:  'text-green-400',
  rare:      'text-blue-400',
  epic:      'text-purple-400',
  legendary: 'text-yellow-400',
};

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
      .order('quantity', { ascending: false }),
    supabase
      .from('character_known_recipes')
      .select('learned_at, recipes(*, item_definitions(id, display_name, rarity))')
      .eq('character_id', character.id)
      .order('learned_at', { ascending: false }),
    supabase
      .from('recipes')
      .select('*, item_definitions!output_item_id(id, name, display_name, rarity), skills!required_skill_id(name)')
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
      rarity:       i.item_definitions.rarity,
      stats:        i.item_definitions.stats,
      tool_tier:    i.item_definitions.tool_tier,
    }));
  const invAvailable: EquipItemData[] = inventory
    .filter(i => !i.equipped_slot && i.item_definitions && EQUIP_TYPES.has(i.item_definitions.type))
    .map(i => ({ ...i.item_definitions, item_id: i.item_id, source: 'inventory' as const }));
  const stashAvailable: EquipItemData[] = stash
    .filter(s => s.item_definitions && EQUIP_TYPES.has(s.item_definitions.type))
    .map(s => ({ ...s.item_definitions, item_id: s.item_id, source: 'stash' as const }));
  const equipAvailable: EquipItemData[] = [
    ...invAvailable,
    ...stashAvailable.filter(s => !invAvailable.some(i => i.item_id === s.item_id)),
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
    item_definitions: { id: string; name?: string; display_name: string; rarity: string } | null;
  };
  const recipeList = ((knownRecipeRows ?? [])
    .map((r: Record<string, unknown>) => r.recipes)
    .filter(Boolean)) as KnownRecipe[];

  const refineList = (refiningRows ?? []) as KnownRecipe[];

  // Combined quantity map (inventory + stash) for client components to check ingredient availability
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
    recipes: (refineList as RefineRecipe[]).filter(
      r => (r.skills as { name: string } | null)?.name === skillName
    ),
  })).filter(g => g.recipes.length > 0);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-2xl font-black text-primary">🏠 Home Base</h2>
        <p className="text-muted-foreground text-sm">Your sanctuary. Rest, craft, and manage your belongings.</p>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="inventory">
            Inventory
            {inventoryResources.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{inventoryResources.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="stash">
            Stash
            {stashAndEquipCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{stashAndEquipCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="refining">Refining</TabsTrigger>
          <TabsTrigger value="crafting">Crafting</TabsTrigger>
        </TabsList>

        {/* ── Inventory ── */}
        <TabsContent value="inventory" className="mt-4">
          {inventoryResources.length === 0 ? (
            <EmptyState icon="🎒" message="Your inventory is empty. Head to the Wilds to gather resources." />
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <EquipmentModal
                  characterId={character.id}
                  equipped={equippedItems}
                  available={equipAvailable}
                />
                <DepositAllButton characterId={character.id} />
              </div>
              {inventoryResources.map(item => {
                const def = item.item_definitions;
                const resInfo = getResourceInfo(def?.name ?? '');
                const displayLabel = resInfo
                  ? `${resInfo.type} · Tier ${resInfo.tier}`
                  : (def?.display_name ?? 'Unknown item');
                const subLabel = resInfo ? (def?.name?.includes('_log') || def?.name?.includes('_plank') || def?.name === 'limestone' || def?.name === 'granite' || def?.name === 'slate' || def?.name === 'marble' || def?.name === 'obsidian_stone' || def?.name?.endsWith('_ore') || def?.name?.endsWith('_hide') || def?.name?.endsWith('_pelt') || def?.name?.endsWith('_fiber') || def?.name?.endsWith('_thread') || def?.name?.endsWith('_silk') ? 'Raw' : 'Refined') : def?.type;
                return (
                  <div
                    key={item.item_id}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2.5">
                      {(() => {
                        const path = getResourceIconPath(def?.name ?? '');
                        return path
                          ? <Image src={path} alt="" width={28} height={28} className="w-7 h-7 object-contain shrink-0" />
                          : null;
                      })()}
                      <div>
                        <span className={`font-semibold text-sm ${RARITY_COLORS[def?.rarity ?? 'common']}`}>
                          {displayLabel}
                        </span>
                        <span className="text-muted-foreground text-xs ml-2 capitalize">{subLabel}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {item.quantity > 1 && (
                        <span className="text-sm text-muted-foreground tabular-nums">×{item.quantity}</span>
                      )}
                      {item.equipped_slot && (
                        <Badge variant="outline" className="text-xs capitalize">{item.equipped_slot}</Badge>
                      )}
                      <Badge variant="secondary" className={`text-xs capitalize ${RARITY_COLORS[def?.rarity ?? 'common']}`}>
                        {def?.rarity}
                      </Badge>
                      {!item.equipped_slot && (
                        <DepositButton characterId={character.id} itemId={item.item_id} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Stash ── */}
        <TabsContent value="stash" className="mt-4">
          {stashAndEquipCount === 0 ? (
            <EmptyState icon="📦" message="Your stash is empty. Deposit items from your inventory to store them safely." />
          ) : (
            <div className="space-y-2">
              {/* Equipment from inventory (equipped or held) */}
              {inventoryEquip.length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold px-1">Equipment</p>
                  {inventoryEquip.map(item => {
                    const def = item.item_definitions;
                    return (
                      <div
                        key={item.item_id}
                        className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-2.5">
                          {(() => {
                            const path = getResourceIconPath(def?.name ?? '');
                            return path
                              ? <Image src={path} alt="" width={28} height={28} className="w-7 h-7 object-contain shrink-0" />
                              : <span className="text-lg shrink-0">{def?.type === 'tool' ? '⛏️' : def?.type === 'weapon' ? '⚔️' : '🛡️'}</span>;
                          })()}
                          <div>
                            <span className={`font-semibold text-sm ${RARITY_COLORS[def?.rarity ?? 'common']}`}>
                              {def?.display_name ?? 'Unknown'}
                            </span>
                            <span className="text-muted-foreground text-xs ml-2 capitalize">{def?.type}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.equipped_slot ? (
                            <Badge className="text-xs capitalize bg-primary/15 text-primary border-primary/30 border">
                              ✓ {item.equipped_slot}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">In bag</Badge>
                          )}
                          <Badge variant="secondary" className={`text-xs capitalize ${RARITY_COLORS[def?.rarity ?? 'common']}`}>
                            {def?.rarity}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Regular stash items */}
              {stash.length > 0 && (
                <>
                  {inventoryEquip.length > 0 && (
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold px-1 pt-2">Stored</p>
                  )}
                  {stash.map(item => {
                    const def = item.item_definitions;
                    const resInfo = getResourceInfo(def?.name ?? '');
                    const displayLabel = resInfo
                      ? `${resInfo.type} · Tier ${resInfo.tier}`
                      : (def?.display_name ?? 'Unknown item');
                    const subLabel = resInfo ? (def?.name?.includes('_block') || def?.name?.includes('_plank') || def?.name?.includes('_slab') || def?.name?.includes('_ingot') || def?.name?.includes('_cloth') || def?.name?.includes('_leather') || def?.name === 'leather' ? 'Refined' : 'Raw') : def?.type;
                    return (
                      <div
                        key={item.item_id}
                        className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-2.5">
                          {(() => {
                            const path = getResourceIconPath(def?.name ?? '');
                            return path
                              ? <Image src={path} alt="" width={28} height={28} className="w-7 h-7 object-contain shrink-0" />
                              : null;
                          })()}
                          <div>
                            <span className={`font-semibold text-sm ${RARITY_COLORS[def?.rarity ?? 'common']}`}>
                              {displayLabel}
                            </span>
                            <span className="text-muted-foreground text-xs ml-2 capitalize">{subLabel}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {item.quantity > 1 && (
                            <span className="text-sm text-muted-foreground tabular-nums">×{item.quantity}</span>
                          )}
                          <Badge variant="secondary" className={`text-xs capitalize ${RARITY_COLORS[def?.rarity ?? 'common']}`}>
                            {def?.rarity}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Refining ── */}
        <TabsContent value="refining" className="mt-4">
          <HomeRefiningPanel
            refineGroups={refineGroups}
            qtyMap={qtyMap}
            characterId={character.id}
          />
        </TabsContent>

        {/* ── Crafting ── */}
        <TabsContent value="crafting" className="mt-4">
          <HomeCraftingPanel
            recipeList={recipeList}
            qtyMap={qtyMap}
            characterId={character.id}
          />
        </TabsContent>
      </Tabs>
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
