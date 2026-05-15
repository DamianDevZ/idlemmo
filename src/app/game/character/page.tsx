import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { calcDerivedStats, xpRequiredForLevel } from '@/lib/game/formulas';
import { GAME_CONFIG } from '@/config/game.config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EquipmentPanel } from '@/components/game/EquipmentPanel';
import type { EquippedData, EquipItemData } from '@/components/game/EquipmentPanel';
import type { DbCharacter, DbCharacterAttributes } from '@/types/game';

export const dynamic = 'force-dynamic';

export default async function CharacterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: character } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', user.id)
    .single() as { data: DbCharacter | null };

  if (!character) redirect('/game/create-character');

  const { data: attributes } = await supabase
    .from('character_attributes')
    .select('*')
    .eq('character_id', character.id)
    .single() as { data: DbCharacterAttributes | null };

  if (!attributes) redirect('/game');

  // Get equipped armor's armor_rating stat for defense calculation
  const { data: equippedArmor } = await supabase
    .from('character_inventory')
    .select('item_definitions(stats)')
    .eq('character_id', character.id)
    .eq('equipped_slot', 'armor')
    .single() as { data: { item_definitions: { stats: Record<string, number> } | null } | null };

  const armorRating = Number((equippedArmor?.item_definitions?.stats?.armor_rating) ?? 0);
  const derived = calcDerivedStats(attributes, armorRating);

  // ── Equipment data ──────────────────────────────────────────────────────────
  const EQUIP_TYPES = ['weapon', 'armor', 'tool'];

  const [{ data: rawInv }, { data: rawStash }] = await Promise.all([
    supabase
      .from('character_inventory')
      .select('item_id, quantity, equipped_slot, item_definitions(id, name, display_name, type, rarity, stats, tool_tier)')
      .eq('character_id', character.id),
    supabase
      .from('character_stash')
      .select('item_id, quantity, item_definitions(id, name, display_name, type, rarity, stats, tool_tier)')
      .eq('character_id', character.id),
  ]);

  type RawInvRow = {
    item_id: string; quantity: number; equipped_slot: string | null;
    item_definitions: { id: string; name: string; display_name: string; type: string; rarity: string; stats: Record<string, number>; tool_tier: number | null } | null;
  };
  type RawStashRow = {
    item_id: string; quantity: number;
    item_definitions: { id: string; name: string; display_name: string; type: string; rarity: string; stats: Record<string, number>; tool_tier: number | null } | null;
  };

  const invRows   = (rawInv   ?? []) as unknown as RawInvRow[];
  const stashRows = (rawStash ?? []) as unknown as RawStashRow[];

  // Currently equipped items
  const equippedItems: EquippedData[] = invRows
    .filter(r => r.equipped_slot && r.item_definitions)
    .map(r => ({
      slot:         r.equipped_slot!,
      item_id:      r.item_id,
      display_name: r.item_definitions!.display_name,
      name:         r.item_definitions!.name,
      type:         r.item_definitions!.type,
      rarity:       r.item_definitions!.rarity,
      stats:        r.item_definitions!.stats,
      tool_tier:    r.item_definitions!.tool_tier,
    }));

  // Unequipped equippable items from inventory
  const invAvailable: EquipItemData[] = invRows
    .filter(r => !r.equipped_slot && r.item_definitions && EQUIP_TYPES.includes(r.item_definitions.type))
    .map(r => ({ ...r.item_definitions!, item_id: r.item_id, source: 'inventory' as const }));

  // Equippable items from stash
  const stashAvailable: EquipItemData[] = stashRows
    .filter(r => r.item_definitions && EQUIP_TYPES.includes(r.item_definitions.type))
    .map(r => ({ ...r.item_definitions!, item_id: r.item_id, source: 'stash' as const }));

  // Merge — prefer inventory item if same item_id exists in both
  const stashNotInInv = stashAvailable.filter(
    s => !invAvailable.some(i => i.item_id === s.item_id)
  );
  const availableItems: EquipItemData[] = [...invAvailable, ...stashNotInInv];

  const xpNeeded = xpRequiredForLevel(character.main_level);
  const xpPercent = Math.min(100, Math.round((character.main_xp / xpNeeded) * 100));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-primary">{character.name}</h2>
        <p className="text-muted-foreground text-sm">
          Level {character.main_level} · {character.skill_points_available} skill point{character.skill_points_available !== 1 ? 's' : ''} available
        </p>
      </div>

      {/* XP */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Level {character.main_level} → {character.main_level + 1}</span>
            <span className="tabular-nums text-xs text-muted-foreground">
              {character.main_xp.toLocaleString()} / {xpNeeded.toLocaleString()} XP
            </span>
          </div>
          <Progress value={xpPercent} className="h-2" />
        </CardContent>
      </Card>

      {/* Equipment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Equipment</CardTitle>
          <CardDescription>Click a slot to equip from inventory or stash. Tools boost gathering; weapon &amp; armor matter in combat.</CardDescription>
        </CardHeader>
        <CardContent>
          <EquipmentPanel
            characterId={character.id}
            equipped={equippedItems}
            available={availableItems}
          />
        </CardContent>
      </Card>

      {/* Derived stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Derived Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-2 text-sm">
            <DerivedRow label="Max HP"          value={derived.maxHp} />
            <DerivedRow label="Max Stamina"     value={derived.maxStamina} />
            <DerivedRow label="Carry Slots"     value={derived.carrySlots} />
            <DerivedRow label="HP Regen /min"   value={`${derived.hpRegenPerMin.toFixed(1)} hp`} />
            <DerivedRow label="Gather Speed"    value={`${(derived.gatherSpeedDivisor * 100 - 100).toFixed(0)}% faster`} />
            <DerivedRow label="Gather Yield"    value={`×${derived.gatherYieldMult.toFixed(2)}`} />
            <DerivedRow label="Refine Eff."     value={`×${derived.refineEfficiencyMult.toFixed(2)}`} />
            <DerivedRow label="Craft Success"   value={`+${derived.craftSuccessBonus.toFixed(1)}%`} />
            <DerivedRow label="Rare Find"       value={`+${derived.rareChanceBonus.toFixed(1)}%`} />
            <DerivedRow label="Crit Chance"     value={`${derived.critChance.toFixed(1)}%`} />
            <DerivedRow label="Crit Damage"     value={`×${derived.critDamageMult.toFixed(2)}`} />
          </div>
        </CardContent>
      </Card>

      {/* Skills shortcut */}
      <Link
        href="/game/skills"
        className="flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-accent/20 transition-all group"
      >
        <div>
          <p className="font-bold text-sm group-hover:text-primary transition-colors">🎯 Skills</p>
          <p className="text-xs text-muted-foreground">Gathering · Combat · Crafting · Magic</p>
        </div>
        <span className="text-muted-foreground/40 group-hover:text-primary/60 transition-colors">→</span>
      </Link>
    </div>
  );
}

function DerivedRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
