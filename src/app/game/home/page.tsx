import { redirect } from 'next/navigation';
import Image from 'next/image';
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

const RARITY_COLORS: Record<string, string> = {
  common:    'text-foreground',
  uncommon:  'text-green-400',
  rare:      'text-blue-400',
  epic:      'text-purple-400',
  legendary: 'text-yellow-400',
};

const RARITY_BORDERS: Record<string, string> = {
  common:    'border-border',
  uncommon:  'border-green-500/40',
  rare:      'border-blue-500/40',
  epic:      'border-purple-500/40',
  legendary: 'border-yellow-500/40',
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
      equipment_tier: i.item_definitions.equipment_tier,
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
                        if (path) return <Image src={path} alt="" width={28} height={28} className="w-7 h-7 object-contain shrink-0" />;
                        if (def?.image_url) return <ItemSprite imageUrl={def.image_url} tier={item.tier} size={28} className="shrink-0" />;
                        return null;
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
                        <Badge variant="outline" className="text-xs">{formatSlot(item.equipped_slot!)}</Badge>
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
            <div className="space-y-4">

              {/* Equipment from inventory (equipped or held) — 2-col cards */}
              {inventoryEquip.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold px-0.5">Equipment</p>
                  <div className="grid grid-cols-2 gap-2">
                    {inventoryEquip.map(item => {
                      const def = item.item_definitions;
                      return (
                        <div
                          key={item.item_id}
                          className={`flex items-center gap-3 px-3 py-3 rounded-lg border bg-card ${RARITY_BORDERS[def?.rarity ?? 'common']}`}
                        >
                        <ItemSprite
                            imageUrl={def?.image_url}
                            tier={item.tier}
                            size={40}
                            className="shrink-0"
                            fallback={<span className="text-xl">{def?.type === 'tool' ? '⛏️' : def?.type === 'weapon' ? '⚔️' : '🛡️'}</span>}
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${RARITY_COLORS[def?.rarity ?? 'common']}`}>
                              {def?.display_name ?? 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">{def?.type}</p>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${
                            item.equipped_slot ? 'text-primary' : 'text-muted-foreground'
                          }`}>
                            {item.equipped_slot ? '✓' : 'bag'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stored resources — true 1:1 square grid */}
              {stash.length > 0 && (
                <div className="space-y-1.5">
                  {inventoryEquip.length > 0 && (
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold px-0.5">Stored</p>
                  )}
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {stash.map(item => {
                      const def = item.item_definitions;
                      const resInfo = getResourceInfo(def?.name ?? '');
                      const label = resInfo
                        ? `${resInfo.type} T${resInfo.tier}`
                        : (def?.display_name ?? '?');
                      const iconPath = getResourceIconPath(def?.name ?? '');
                      const typeIcon = def?.type === 'weapon' ? '⚔️'
                        : def?.type === 'armor' ? '🛡️'
                        : def?.type === 'tool'  ? '⛏️' : '📦';
                      const qty = item.quantity;
                      const qtyLabel = qty >= 10_000
                        ? `×${(qty / 1000).toFixed(0)}k`
                        : qty > 1 ? `×${qty}` : null;
                      return (
                        <div
                          key={item.item_id}
                          title={def?.display_name ?? ''}
                          className={`relative aspect-square rounded-lg border bg-card overflow-hidden ${
                            RARITY_BORDERS[def?.rarity ?? 'common']
                          }`}
                        >
                          {/* Icon fills the cell */}
                          <div className="absolute inset-0 flex items-center justify-center p-2">
                            {iconPath ? (
                              <Image src={iconPath} alt="" width={56} height={56} className="w-full h-full object-contain" />
                            ) : def?.image_url ? (
                              <ItemSprite imageUrl={def.image_url} tier={item.tier} size={56} />
                            ) : (
                              <span className="text-3xl">{typeIcon}</span>
                            )}
                          </div>
                          {/* Quantity — top-right */}
                          {qtyLabel && (
                            <span className="absolute top-1 right-1 text-[11px] tabular-nums font-black text-white leading-none"
                              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                              {qtyLabel}
                            </span>
                          )}
                          {/* Name — bottom strip */}
                          <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5">
                            <p className="text-[10px] text-white/80 text-center leading-tight truncate">{label}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
