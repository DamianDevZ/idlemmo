import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProgressionClient } from './ProgressionClient';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Progression — Admin' };

export default async function ProgressionPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [{ data }, { data: maxTierRow }] = await Promise.all([
    db.from('skill_categories')
      .select('id, name, display_name, action_xp_per_unit, action_xp_scaling, tier_xp_base, tier_xp_scaling')
      .order('name'),
    db.from('game_config').select('value').eq('key', 'max_tier').single(),
  ]);

  type RawCategory = {
    id: string;
    name: string;
    display_name: string;
    action_xp_per_unit: number;
    action_xp_scaling:  number;
    tier_xp_base: number;
    tier_xp_scaling: number;
  };

  const categories = (data ?? []) as unknown as RawCategory[];
  const maxTier = (maxTierRow?.value as number | null) ?? 10;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-body transition-colors">&larr; Admin</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-heading">Progression</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Configure how much XP each activity awards and how expensive it is to level up each skill category.
        The tier cost preview shows XP required to reach each tier using the formula{' '}
        <code className="text-xs bg-card border border-border px-1 py-0.5 rounded">floor(base x scaling^currentTier)</code>.
      </p>
      <ProgressionClient categories={categories} maxTier={maxTier} />
    </div>
  );
}
