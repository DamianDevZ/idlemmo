import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { EnemyForm } from '@/components/admin/EnemyForm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const BLANK = {
  name: '', display_name: '', description: '', icon: '👹', sort_order: 0,
  damage_type: 'slash', attack_speed: 1.0, base_hp: 20, base_attack: 5, resistances: {},
};

export default async function EnemyEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === 'new';
  const db = createAdminClient();

  const [itemsResult, maxTierResult] = await Promise.all([
    db.from('item_definitions').select('id, display_name, type, name, is_tiered').order('display_name'),
    db.from('game_config').select('value').eq('key', 'max_tier').maybeSingle(),
  ]);

  const items = (itemsResult.data ?? []) as { id: string; display_name: string; type: string; name: string; is_tiered: boolean }[];
  const maxTier = Number((maxTierResult.data as { value: number } | null)?.value ?? 5) || 5;

  let enemy = BLANK;
  type TierLootRow = { id: string; tier: number; item_id: string; item_tier: number | null; weight: number };
  let lootRows: TierLootRow[] = [];

  if (!isNew) {
    const { data } = await db.from('enemies').select('*').eq('id', id).single();
    if (!data) notFound();
    enemy = data;
    const { data: loot } = await db
      .from('enemy_tier_loot')
      .select('id, tier, item_id, item_tier, weight')
      .eq('enemy_id', id)
      .order('tier')
      .order('weight', { ascending: false });
    lootRows = (loot ?? []) as TierLootRow[];
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/enemies" className="text-sm text-muted-foreground hover:text-body transition-colors">
          ← Enemies
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-heading">{isNew ? 'New Enemy' : enemy.display_name}</h1>
      </div>
      <EnemyForm
        enemyId={isNew ? null : id}
        initial={enemy}
        lootRows={lootRows}
        allItems={items}
        maxTier={maxTier}
      />
    </div>
  );
}
