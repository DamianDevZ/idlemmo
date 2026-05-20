import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { skillTierXpCost, xpRequiredForLevel } from '@/lib/game/formulas';
import { GAME_CONFIG } from '@/config/game.config';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PersistentTabs } from '@/components/ui/PersistentTabs';
import AttributeSpendButton from '@/components/game/AttributeSpendButton';
import { MasteryAllocator, type MasteryCategoryData, type MasteryItemData } from './MasteryAllocator';
import type {
  DbCharacter,
  DbCharacterAttributes,
  DbSkillCategory,
  DbCharacterCategoryPoints,
  AttributeName,
} from '@/types/game';

export const dynamic = 'force-dynamic';

const ATTRIBUTE_META: {
  name: AttributeName;
  label: string;
  icon: string;
  description: string;
}[] = [
  { name: 'vigor',        label: 'Vigor',        icon: 'heart',  description: `+${GAME_CONFIG.attributes.hpPerVigor} max HP per point` },
  { name: 'endurance',    label: 'Endurance',     icon: 'shield', description: `+${GAME_CONFIG.attributes.slotsPerEndurance} carry slots per point` },
  { name: 'strength',     label: 'Strength',      icon: 'fist',  description: 'Melee damage and gather yield' },
  { name: 'dexterity',    label: 'Dexterity',     icon: 'run',  description: 'Attack speed, gather speed and crit chance' },
  { name: 'intelligence', label: 'Intelligence',  icon: 'brain',  description: 'Magic damage and refining efficiency' },
  { name: 'faith',        label: 'Faith',         icon: 'spark',  description: `Craft success +${GAME_CONFIG.attributes.faithCraftBonus}% and HP regen` },
  { name: 'arcane',       label: 'Arcane',        icon: 'gem',  description: `Rare item find +${GAME_CONFIG.attributes.arcaneRareFactor}% per point` },
];

const ATTR_DISPLAY_ICON: Record<string, string> = {
  vigor: '\u2764\uFE0F', endurance: '\uD83D\uDEE1\uFE0F', strength: '\uD83D\uDCAA',
  dexterity: '\uD83C\uDFC3', intelligence: '\uD83E\uDDE0', faith: '\u2728', arcane: '\uD83D\uDD2E',
};

const MASTERY_CATS  = ['weapon_mastery',  'armor_mastery',  'tool_mastery'];
const CRAFTING_CATS = ['weapon_crafting', 'armor_crafting', 'tool_crafting'];
const REFINING_CATS = ['refining'];

type RawMastery = {
  id: string;
  category_name: string;
  tier: number;
  xp_toward_next_tier: number;
  item_definitions: { id: string; display_name: string; image_url: string | null } | null;
};

export default async function SkillsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: character } = await supabase
    .from('characters')
    .select('id, skill_points_available, main_level, main_xp')
    .eq('user_id', user.id)
    .single() as { data: Pick<DbCharacter, 'id' | 'skill_points_available' | 'main_level' | 'main_xp'> | null };

  if (!character) redirect('/create-character');

  const [
    { data: attrs },
    { data: categories },
    { data: catPoints },
    { data: rawMasteries },
    { data: maxTierConfig },
  ] = await Promise.all([
    supabase.from('character_attributes').select('*').eq('character_id', character.id).single() as unknown as Promise<{ data: DbCharacterAttributes | null }>,
    supabase.from('skill_categories').select('*').order('name'),
    supabase.from('character_category_points').select('*').eq('character_id', character.id),
    supabase
      .from('character_item_mastery')
      .select('id, category_name, tier, xp_toward_next_tier, item_definitions(id, display_name, image_url)')
      .eq('character_id', character.id),
    supabase.from('game_config').select('value').eq('key', 'max_tier').single(),
  ]);

  const allCats    = (categories as DbSkillCategory[] | null) ?? [];
  const allPoints  = (catPoints  as DbCharacterCategoryPoints[] | null) ?? [];
  const masteries  = (rawMasteries as unknown as RawMastery[] | null) ?? [];
  const maxTier    = Number((maxTierConfig as { value?: unknown } | null)?.value ?? 10);

  const catByName  = new Map(allCats.map(c => [c.name, c]));
  const pointsByCat = new Map(allPoints.map(p => [p.category_id, p]));

  // Index mastery rows by category_name
  const masteriesByCategory = new Map<string, RawMastery[]>();
  for (const m of masteries) {
    if (!masteriesByCategory.has(m.category_name)) masteriesByCategory.set(m.category_name, []);
    masteriesByCategory.get(m.category_name)!.push(m);
  }

  function buildCategoryData(catNames: string[]): MasteryCategoryData[] {
    return catNames.map(catName => {
      const cat = catByName.get(catName as never);
      if (!cat) return null;
      const pool     = pointsByCat.get(cat.id);
      const poolXp   = (pool?.xp_available as number) ?? 0;
      const xpBase   = (cat as unknown as { tier_xp_base?: number }).tier_xp_base;
      const xpScale  = (cat as unknown as { tier_xp_scaling?: number }).tier_xp_scaling;
      const catItems = masteriesByCategory.get(catName) ?? [];
      const items: MasteryItemData[] = catItems
        .filter(m => m.item_definitions !== null)
        .map(m => {
          const tier        = m.tier;
          const xpTowardNext = m.xp_toward_next_tier;
          const xpCostNext  = skillTierXpCost(tier, xpBase, xpScale);
          const def         = m.item_definitions!;
          return {
            masteryId:        m.id,
            itemDefinitionId: def.id,
            displayName:      def.display_name,
            imageUrl:         def.image_url,
            currentTier:      tier,
            xpTowardNext,
            xpCostNext,
            maxTier,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return {
        name:        catName,
        displayName: cat.display_name,
        categoryId:  cat.id,
        characterId: character!.id,
        poolXp,
        items,
      } satisfies MasteryCategoryData;
    }).filter((c): c is MasteryCategoryData => c !== null);
  }

  const masteryCats  = buildCategoryData(MASTERY_CATS);
  const craftingCats = buildCategoryData(CRAFTING_CATS);
  const refiningCats = buildCategoryData(REFINING_CATS);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-primary">Skills</h2>
        <p className="text-muted-foreground text-sm">Train, refine, and craft your way to power.</p>
      </div>

      <PersistentTabs storageKey="skills" defaultValue="attributes">
        <TabsList className="w-full grid grid-cols-4 p-0.5 mb-4">
          <TabsTrigger value="attributes" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>Stats</span>
          </TabsTrigger>
          <TabsTrigger value="mastery" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>Mastery</span>
          </TabsTrigger>
          <TabsTrigger value="crafting" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>Crafting</span>
          </TabsTrigger>
          <TabsTrigger value="refining" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>Refining</span>
          </TabsTrigger>
        </TabsList>

        {/* Attributes */}
        <TabsContent value="attributes" className="space-y-2">
          {(() => {
            const lvl    = character.main_level ?? 1;
            const curXp  = character.main_xp   ?? 0;
            const needed = xpRequiredForLevel(lvl);
            const pct    = Math.round((curXp / needed) * 100);
            return (
              <div className="px-4 py-3 rounded-xl border border-border bg-card mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">Overall Level</span>
                  <span className="text-primary font-bold tabular-nums text-lg">{lvl}</span>
                </div>
                <Progress value={pct} className="h-2 mb-1" />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{curXp} / {needed} XP</span>
                  <span>{pct}%</span>
                </div>
              </div>
            );
          })()}
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Raise core stats by spending skill points.</p>
            {character.skill_points_available > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                {character.skill_points_available} pts to spend
              </Badge>
            )}
          </div>
          {ATTRIBUTE_META.map(attr => {
            const value = attrs ? (attrs[attr.name as keyof DbCharacterAttributes] as number) : 0;
            const pct   = Math.round((value / GAME_CONFIG.attributes.maxValue) * 100);
            return (
              <div key={attr.name} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card">
                <span className="text-2xl w-8 text-center shrink-0">{ATTR_DISPLAY_ICON[attr.name]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{attr.label}</span>
                    <span className="text-primary font-bold tabular-nums">{value}</span>
                  </div>
                  <Progress value={pct} className="h-1.5 mb-1" />
                  <p className="text-[11px] text-muted-foreground">{attr.description}</p>
                </div>
                {attrs && (
                  <AttributeSpendButton
                    characterId={character.id}
                    attribute={attr.name}
                    currentValue={value}
                    pointsAvailable={character.skill_points_available}
                  />
                )}
              </div>
            );
          })}
        </TabsContent>

        {/* Mastery */}
        <TabsContent value="mastery">
          <p className="text-xs text-muted-foreground mb-3">
            Mastery XP comes from combat and gathering. Spend it on discovered weapons, armor, and tools to unlock higher tiers.
          </p>
          <MasteryAllocator categories={masteryCats} maxTier={maxTier} />
        </TabsContent>

        {/* Crafting */}
        <TabsContent value="crafting">
          <p className="text-xs text-muted-foreground mb-3">
            Crafting XP is earned by crafting items. Unlock higher-quality crafting for each item you have made before.
          </p>
          <MasteryAllocator categories={craftingCats} maxTier={maxTier} />
        </TabsContent>

        {/* Refining */}
        <TabsContent value="refining">
          <p className="text-xs text-muted-foreground mb-3">
            Refining XP comes from refining raw materials. Discover new materials by gathering them in the world.
          </p>
          <MasteryAllocator categories={refiningCats} maxTier={maxTier} />
        </TabsContent>
      </PersistentTabs>
    </div>
  );
}