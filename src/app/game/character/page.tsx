import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { calcDerivedStats, xpRequiredForLevel } from '@/lib/game/formulas';
import { GAME_CONFIG } from '@/config/game.config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EquipmentPanel } from '@/components/game/EquipmentPanel';
import type { EquippedData, EquipItemData } from '@/components/game/EquipmentPanel';
import type { DbCharacter, DbCharacterAttributes, AttributeName } from '@/types/game';

export const dynamic = 'force-dynamic';

const ATTRIBUTE_META: { name: AttributeName; label: string; icon: string }[] = [
  { name: 'vigor',        label: 'Vigor',        icon: '❤️'  },
  { name: 'endurance',    label: 'Endurance',    icon: '🛡️' },
  { name: 'strength',     label: 'Strength',     icon: '💪'  },
  { name: 'dexterity',    label: 'Dexterity',    icon: '🏃'  },
  { name: 'intelligence', label: 'Intelligence', icon: '🧠'  },
  { name: 'faith',        label: 'Faith',        icon: '✨'  },
  { name: 'arcane',       label: 'Arcane',       icon: '🔮'  },
];

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
      .select('item_id, quantity, equipped_slot, item_definitions(id, name, display_name, type, rarity, stats, equipment_tier)')
      .eq('character_id', character.id),
    supabase
      .from('character_stash')
      .select('item_id, quantity, item_definitions(id, name, display_name, type, rarity, stats, equipment_tier)')
      .eq('character_id', character.id),
  ]);

  type RawInvRow = {
    item_id: string; quantity: number; equipped_slot: string | null;
    item_definitions: { id: string; name: string; display_name: string; type: string; rarity: string; stats: Record<string, number>; equipment_tier: number | null } | null;
  };
  type RawStashRow = {
    item_id: string; quantity: number;
    item_definitions: { id: string; name: string; display_name: string; type: string; rarity: string; stats: Record<string, number>; equipment_tier: number | null } | null;
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
      equipment_tier: r.item_definitions!.equipment_tier,
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

      {/* Attributes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Attributes</CardTitle>
            {character.skill_points_available > 0 ? (
              <Link href="/game/skills" className="text-xs text-primary hover:underline">
                {character.skill_points_available} point{character.skill_points_available !== 1 ? 's' : ''} to spend →
              </Link>
            ) : (
              <Link href="/game/skills" className="text-xs text-muted-foreground hover:underline">
                Skills →
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
            {ATTRIBUTE_META.map(({ name, label, icon }) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="text-base leading-none">{icon}</span>
                  {label}
                </span>
                <span className="font-semibold tabular-nums">{attributes[name]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Character Stats — grouped by category */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Character Stats</CardTitle>
          <CardDescription className="text-xs">Derived from your attributes and equipment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ── Vitals ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">❤️ Vitals (Vigor)</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <StatRow label="Max HP"    value={derived.maxHp} />
              <StatRow label="HP Regen"  value={`${derived.hpRegenPerMin.toFixed(1)} hp/min`} />
            </div>
          </div>

          {/* ── Endurance ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🛡️ Endurance</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <StatRow label="Carry Slots"    value={derived.carrySlots} />
              <StatRow label="Offline Ticks"  value={derived.offlineTicks} />
            </div>
          </div>

          {/* ── Damage Scalers ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">⚔️ Damage (Str / Dex / Int)</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <StatRow label="Melee (Str)"   value={`×${derived.meleeDamageMult.toFixed(2)}`} />
              <StatRow label="Ranged (Dex)"  value={`×${derived.rangedDamageMult.toFixed(2)}`} />
              <StatRow label="Magic (Int)"   value={`×${derived.magicDamageMult.toFixed(2)}`} />
              <StatRow label="Defense"       value={`${(derived.defenseReduction * 100).toFixed(0)}% reduction`} />
            </div>
          </div>

          {/* ── Faith ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">✨ Faith</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <StatRow label="Consumable Mult" value={`×${derived.faithConsumableMult.toFixed(2)}`} />
            </div>
          </div>

          {/* ── Arcane ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🔮 Arcane</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <StatRow label="Explore Luck" value={`+${derived.arcaneExploreLuck.toFixed(1)}%`} />
            </div>
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

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
