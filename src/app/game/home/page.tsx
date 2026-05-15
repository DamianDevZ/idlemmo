import { redirect } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { getResourceIconPath, getResourceInfo } from '@/lib/item-icon';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DepositButton, DepositAllButton } from '@/components/game/DepositButton';
import { CraftButton } from '@/components/game/CraftButton';
import { RefineButton } from '@/components/game/RefineButton';
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

  type KnownRecipe = {
    id: string;
    display_name: string;
    output_item_id: string;
    output_quantity: number;
    required_skill_level: number;
    ingredients: unknown;
    tier: number;
    category: string;
    item_definitions: { id: string; display_name: string; rarity: string } | null;
  };
  const recipeList = ((knownRecipeRows ?? [])
    .map((r: Record<string, unknown>) => r.recipes)
    .filter(Boolean)) as KnownRecipe[];

  const refineList = (refiningRows ?? []) as KnownRecipe[];

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
            {inventory.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{inventory.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="stash">
            Stash
            {stash.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{stash.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="refining">Refining</TabsTrigger>
          <TabsTrigger value="crafting">Crafting</TabsTrigger>
        </TabsList>

        {/* ── Inventory ── */}
        <TabsContent value="inventory" className="mt-4">
          {inventory.length === 0 ? (
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
              {inventory.map(item => {
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
          {stash.length === 0 ? (
            <EmptyState icon="📦" message="Your stash is empty. Deposit items from your inventory to store them safely." />
          ) : (
            <div className="space-y-2">
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
            </div>
          )}
        </TabsContent>

        {/* ── Refining ── */}
        <TabsContent value="refining" className="mt-4">
          <p className="text-xs text-muted-foreground mb-4">Always available — no discovery needed. 3 raw → 2 refined.</p>
          <div className="space-y-6">
            {refineGroups.map(group => (
              <div key={group.skillName}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {group.icon} {group.label}
                </h3>
                <div className="space-y-1.5">
                  {group.recipes.map(recipe => {
                    type Ingredient = { name: string; label: string; qty: number };
                    const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
                    const outputDef = recipe.item_definitions as { name?: string; display_name?: string } | null;
                    const outputIcon = getResourceIconPath(outputDef?.name ?? '');
                    const inputIcon  = getResourceIconPath(ingredients[0]?.name ?? '');
                    const canRefine  = ingredients.every(ing => {
                      const inInv   = inventory.find(i => (i.item_definitions as DbItemDefinition | null)?.name === ing.name)?.quantity ?? 0;
                      const inStash = stash.find(i => (i.item_definitions as DbItemDefinition | null)?.name === ing.name)?.quantity ?? 0;
                      return (inInv + inStash) >= ing.qty;
                    });
                    return (
                      <div key={recipe.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                        canRefine ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/40'
                      }`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {inputIcon && <Image src={inputIcon} alt="" width={20} height={20} className="w-5 h-5 object-contain shrink-0 opacity-70" />}
                          <span className="text-xs text-muted-foreground shrink-0">×{ingredients[0]?.qty ?? 3}</span>
                          <span className="text-muted-foreground text-xs">→</span>
                          {outputIcon && <Image src={outputIcon} alt="" width={20} height={20} className="w-5 h-5 object-contain shrink-0" />}
                          <span className="text-xs font-medium">Tier {recipe.tier}</span>
                        </div>
                        <RefineButton characterId={character.id} recipeId={recipe.id} canRefine={canRefine} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Crafting ── */}
        <TabsContent value="crafting" className="mt-4">
          {recipeList.filter(r => r.category !== 'refining').length === 0 ? (
            <EmptyState icon="🔨" message="No recipes discovered yet. Explore the world to find crafting knowledge." />
          ) : (
            <div className="space-y-3">
              {recipeList.filter(r => r.category !== 'refining').map(recipe => {
                const outputDef = recipe.item_definitions;
                const rarity = outputDef?.rarity ?? 'common';
                type Ingredient = { name: string; label: string; qty: number };
                const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
                const canCraft = ingredients.every(ing => {
                  const inInv   = inventory.find(i => (i.item_definitions as DbItemDefinition | null)?.name === ing.name)?.quantity ?? 0;
                  const inStash = stash.find(i => (i.item_definitions as DbItemDefinition | null)?.name === ing.name)?.quantity ?? 0;
                  return (inInv + inStash) >= ing.qty;
                });
                return (
                  <Card key={recipe.id} className="border-border/60">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className={`text-sm ${RARITY_COLORS[rarity]}`}>
                          {stripMaterialPrefix(recipe.display_name)} · Tier {recipe.tier}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{recipe.display_name}</span>
                          <span className="text-xs text-muted-foreground">×{recipe.output_quantity}</span>
                        </div>
                      </div>
                      <CardDescription className="text-xs">
                        Skill lv {recipe.required_skill_level}+
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {ingredients.map((ing) => {
                          const ingInfo  = getResourceInfo(ing.name);
                          const ingLabel = ingInfo ? `${ingInfo.type} T${ingInfo.tier}` : ing.label;
                          const inInv    = inventory.find(i => (i.item_definitions as DbItemDefinition | null)?.name === ing.name)?.quantity ?? 0;
                          const inStash2 = stash.find(i => (i.item_definitions as DbItemDefinition | null)?.name === ing.name)?.quantity ?? 0;
                          const hasEnough = (inInv + inStash2) >= ing.qty;
                          return (
                            <span
                              key={ing.name}
                              className={`text-xs px-2 py-0.5 rounded-full border ${
                                hasEnough
                                  ? 'border-green-500/30 text-green-400 bg-green-500/5'
                                  : 'border-border text-muted-foreground'
                              }`}
                            >
                              {ingLabel} ×{ing.qty}
                            </span>
                          );
                        })}
                      </div>
                      <CraftButton characterId={character.id} recipeId={recipe.id} canCraft={canCraft} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
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
