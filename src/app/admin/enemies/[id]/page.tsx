import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { EnemyForm } from '@/components/admin/EnemyForm';
import Link from 'next/link';

const BLANK = {
  name: '', display_name: '', biome_id: '', tier: 1, level: 1,
  base_hp: 20, base_attack: 5, base_armor: 0, base_speed: 1.0,
  xp_reward: 10, armor_preset_id: 'unarmored', loot_table: [],
};

export default async function EnemyEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === 'new';
  const db = createAdminClient();

  const [{ data: biomes }, { data: presets }] = await Promise.all([
    db.from('biomes').select('id, name').order('name'),
    db.from('armor_presets').select('id, display_name').order('display_name'),
  ]);

  let enemy = BLANK;
  if (!isNew) {
    const { data } = await db.from('enemy_types').select('*').eq('id', id).single();
    if (!data) notFound();
    enemy = data;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/enemies" className="text-sm text-muted-foreground hover:text-body transition-colors">← Enemies</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-heading">{isNew ? 'New Enemy' : enemy.display_name}</h1>
      </div>
      <EnemyForm
        initial={{ ...enemy, id: isNew ? undefined : id } as Parameters<typeof EnemyForm>[0]['initial']}
        biomes={biomes ?? []}
        presets={presets ?? []}
      />
    </div>
  );
}
