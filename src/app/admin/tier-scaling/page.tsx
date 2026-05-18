import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TierScalingClient } from './TierScalingClient';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TierScalingPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [scalingResult, configResult] = await Promise.all([
    db.from('tier_scaling_config')
      .select('id, item_type, stat_key, stat_label, tier, multiplier')
      .order('item_type').order('stat_key').order('tier'),
    db.from('game_config').select('value').eq('key', 'max_tier').single(),
  ]);

  const rows = (scalingResult.data ?? []) as {
    id: string; item_type: string; stat_key: string;
    stat_label: string; tier: number; multiplier: number;
  }[];
  const maxTier = Number((configResult as { data: { value: number } | null }).data?.value ?? 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-body transition-colors">← Admin</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-heading">Tier Scaling</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Configure how stats scale across tiers for each item type.
        Each multiplier is applied to the base stat you set on the item definition —
        so T1 = 1.0× (exactly what you typed), T2 = 1.2× (20% stronger), etc.
        Attack speed on weapons is intentionally excluded — it never scales with tier.
      </p>
      <TierScalingClient rows={rows} maxTier={maxTier} />
    </div>
  );
}
