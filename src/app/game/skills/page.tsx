import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { skillLevelUpCost, xpRequiredForLevel } from '@/lib/game/formulas';
import { GAME_CONFIG } from '@/config/game.config';
import {
  RAW_RESOURCES,
  REFINED_RESOURCES,
  CRAFT_CATEGORIES,
  USAGE_CATEGORIES,
  TIER_REQ_SKILL,
  TIER_COLORS,
  TIER_BORDER,
} from '@/config/crafting.config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AllocatePointButton from '@/components/game/AllocatePointButton';
import AttributeSpendButton from '@/components/game/AttributeSpendButton';
import CraftingPanel from '@/components/game/CraftingPanel';
import RefiningPanel from '@/components/game/RefiningPanel';
import type {
  DbCharacter,
  DbCharacterAttributes,
  DbSkillCategory,
  DbSkill,
  DbCharacterSkill,
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
  { name: 'vigor',        label: 'Vigor',        icon: '❤️',  description: `+${GAME_CONFIG.attributes.hpPerVigor} max HP per point` },
  { name: 'endurance',    label: 'Endurance',     icon: '🛡️', description: `+${GAME_CONFIG.attributes.slotsPerEndurance} carry slots per point` },
  { name: 'strength',     label: 'Strength',      icon: '💪',  description: 'Melee damage and gather yield' },
  { name: 'dexterity',    label: 'Dexterity',     icon: '🏃',  description: 'Attack speed, gather speed and crit chance' },
  { name: 'intelligence', label: 'Intelligence',  icon: '🧠',  description: 'Magic damage and refining efficiency' },
  { name: 'faith',        label: 'Faith',         icon: '✨',  description: `Craft success +${GAME_CONFIG.attributes.faithCraftBonus}% and HP regen` },
  { name: 'arcane',       label: 'Arcane',        icon: '🔮',  description: `Rare item find +${GAME_CONFIG.attributes.arcaneRareFactor}% per point` },
];

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
    { data: skills },
    { data: charSkills },
    { data: catPoints },
  ] = await Promise.all([
    supabase.from('character_attributes').select('*').eq('character_id', character.id).single() as unknown as Promise<{ data: DbCharacterAttributes | null }>,
    supabase.from('skill_categories').select('*').order('name'),
    supabase.from('skills').select('*').order('display_name'),
    supabase.from('character_skills').select('*').eq('character_id', character.id),
    supabase.from('character_category_points').select('*').eq('character_id', character.id),
  ]);

  const allSkills     = (skills     as DbSkill[]                   ) ?? [];
  const allCharSkills = (charSkills as DbCharacterSkill[]          ) ?? [];
  const allCats       = (categories as DbSkillCategory[]           ) ?? [];
  const allPoints     = (catPoints  as DbCharacterCategoryPoints[] ) ?? [];

  const skillByName  = new Map(allSkills.map(s => [s.name, s]));
  const catByName    = new Map(allCats.map(c => [c.name, c]));
  const catById      = new Map(allCats.map(c => [c.id,   c]));
  const pointsByCat  = new Map(allPoints.map(p => [p.category_id, p]));

  const skillLevelByName = new Map<string, number>(
    allSkills.map(s => {
      const cs = allCharSkills.find(c => c.skill_id === s.id);
      return [s.name, cs?.level ?? 0];
    })
  );

  function getCatPoints(catName: string) {
    const cat = catByName.get(catName as never);
    if (!cat) return { available: 0, xpCurrent: 0 };
    const pts = pointsByCat.get(cat.id);
    return { available: pts?.points_available ?? 0, xpCurrent: pts?.xp_current ?? 0 };
  }

  function getAllocProps(skillName: string) {
    const skill = skillByName.get(skillName);
    if (!skill) return null;
    const cat  = catById.get(skill.category_id);
    if (!cat)  return null;
    const level = skillLevelByName.get(skillName) ?? 0;
    const pts   = pointsByCat.get(cat.id);
    const avail = pts?.points_available ?? 0;
    const cost  = skillLevelUpCost(level);
    return {
      characterId: character!.id,
      categoryId:  cat.id,
      skillId:     skill.id,
      cost,
      canAllocate: avail >= cost && level < GAME_CONFIG.skills.maxSkillLevel,
    };
  }

  const xpPerPt       = GAME_CONFIG.skills.categoryXpPerPoint;
  const skillLevelsObj = Object.fromEntries(skillLevelByName);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-primary">Skills</h2>
        <p className="text-muted-foreground text-sm">Train, refine, and craft your way to power.</p>
      </div>

      <Tabs defaultValue="attributes">
        <TabsList className="w-full grid grid-cols-5 p-0.5 mb-4">
          <TabsTrigger value="attributes" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>⚡</span>
            <span className="hidden sm:inline">Attributes</span>
            <span className="sm:hidden">Stats</span>
          </TabsTrigger>
          <TabsTrigger value="gathering" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>🪓</span>
            <span className="hidden sm:inline">Gathering</span>
            <span className="sm:hidden">Gather</span>
          </TabsTrigger>
          <TabsTrigger value="refining" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>🔥</span>
            <span className="hidden sm:inline">Refining</span>
            <span className="sm:hidden">Refine</span>
          </TabsTrigger>
          <TabsTrigger value="crafting" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>🔨</span>
            <span className="hidden sm:inline">Crafting</span>
            <span className="sm:hidden">Craft</span>
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1 text-[11px] data-[state=active]:text-primary">
            <span>⚔️</span>
            <span className="hidden sm:inline">Usage</span>
            <span className="sm:hidden">Use</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── Attributes ─── */}
        <TabsContent value="attributes" className="space-y-2">
          {/* Overall character level XP bar */}
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
                <span className="text-2xl w-8 text-center shrink-0">{attr.icon}</span>
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

        {/* ─── Gathering ─── */}
        <TabsContent value="gathering" className="space-y-3">
          {(() => {
            const { available, xpCurrent } = getCatPoints('gathering');
            const pct = Math.round(((xpCurrent % xpPerPt) / xpPerPt) * 100);
            return (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Gathering XP</span>
                    <span className="text-foreground font-semibold">{available} pts available</span>
                  </div>
                  <Progress value={pct} className="h-1" />
                </div>
              </div>
            );
          })()}
          {RAW_RESOURCES.map(res => {
            const level = skillLevelByName.get(res.skillName) ?? 0;
            const skill = skillByName.get(res.skillName);
            const ap    = getAllocProps(res.skillName);
            return (
              <Card key={res.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="text-2xl">{res.icon}</span>{res.label}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-bold text-xl tabular-nums">{level}</span>
                      {ap && <AllocatePointButton {...ap} />}
                    </div>
                  </div>
                  {skill && <CardDescription className="text-xs">{skill.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-1.5">
                    {res.tierNames.map((name, i) => {
                      const locked = level < TIER_REQ_SKILL[i];
                      return (
                        <div
                          key={i}
                          className={`flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-lg border text-center transition-colors ${
                            locked ? 'border-border opacity-40' : TIER_BORDER[i]
                          }`}
                        >
                          <span className="text-lg">{locked ? '🔒' : res.icon}</span>
                          <span className={`text-[10px] font-bold ${locked ? 'text-muted-foreground' : TIER_COLORS[i]}`}>T{i + 1}</span>
                          <span className={`text-[8px] leading-tight text-center ${locked ? 'text-muted-foreground' : TIER_COLORS[i]}`}>{name}</span>
                          {locked && <span className="text-[8px] text-muted-foreground/60">Lv {TIER_REQ_SKILL[i]}</span>}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ─── Refining ─── */}
        <TabsContent value="refining" className="space-y-3">
          {(() => {
            const { available, xpCurrent } = getCatPoints('refining');
            const pct = Math.round(((xpCurrent % xpPerPt) / xpPerPt) * 100);
            return (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Refining XP</span>
                    <span className="text-foreground font-semibold">{available} pts available</span>
                  </div>
                  <Progress value={pct} className="h-1" />
                </div>
              </div>
            );
          })()}
          <RefiningPanel
            skillLevels={skillLevelsObj}
            allocBySkill={(() => {
              const out: Record<string, { characterId: string; categoryId: string; skillId: string; cost: number; canAllocate: boolean }> = {};
              for (const ref of REFINED_RESOURCES) {
                const ap = getAllocProps(ref.skillName);
                if (ap) out[ref.skillName] = ap;
              }
              return out;
            })()}
          />
        </TabsContent>
        {/* ─── Crafting ─── */}
        <TabsContent value="crafting" className="space-y-6">
          {(() => {
            const { available, xpCurrent } = getCatPoints('crafting');
            const pct = Math.round(((xpCurrent % xpPerPt) / xpPerPt) * 100);
            return (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Crafting XP</span>
                    <span className="text-foreground font-semibold">{available} pts available</span>
                  </div>
                  <Progress value={pct} className="h-1" />
                </div>
              </div>
            );
          })()}
          <CraftingPanel
            skillLevels={skillLevelsObj}
            allocBySkill={(() => {
              const out: Record<string, { characterId: string; categoryId: string; skillId: string; cost: number; canAllocate: boolean }> = {};
              for (const cat of CRAFT_CATEGORIES) {
                for (const recipe of cat.recipes) {
                  const ap = getAllocProps(recipe.skillName);
                  if (ap) out[recipe.skillName] = ap;
                }
              }
              return out;
            })()}
          />
        </TabsContent>

        {/* ─── Usage ─── */}
        <TabsContent value="usage" className="space-y-4">
          {(() => {
            const { available, xpCurrent } = getCatPoints('usage');
            const pct = Math.round(((xpCurrent % xpPerPt) / xpPerPt) * 100);
            return (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Usage XP</span>
                    <span className="text-foreground font-semibold">{available} pts available</span>
                  </div>
                  <Progress value={pct} className="h-1" />
                </div>
              </div>
            );
          })()}
          {USAGE_CATEGORIES.map(cat => (
            <div key={cat.key} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <span>{cat.icon}</span>{cat.label}
              </h3>
              <div className="space-y-2">
                {cat.skills.map(s => {
                  const level = skillLevelByName.get(s.skillName) ?? 0;
                  const ap    = getAllocProps(s.skillName);
                  const cost  = ap?.cost ?? skillLevelUpCost(level);
                  const isMax = level >= GAME_CONFIG.skills.maxSkillLevel;
                  return (
                    <div key={s.skillName} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card">
                      <span className="text-2xl shrink-0">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                        {!isMax && (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            Next level: {cost} pt{cost !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-primary font-bold text-xl tabular-nums">{level}</span>
                        {ap && <AllocatePointButton {...ap} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
