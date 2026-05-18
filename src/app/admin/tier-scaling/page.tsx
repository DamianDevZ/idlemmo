import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TierScalingClient } from './TierScalingClient';
import { TierFramesSection } from './TierFramesSection';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TierScalingPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [scalingResult, configResult, framesResult] = await Promise.all([
    db.from('tier_scaling_config')
      .select('id, item_type, stat_key, stat_label, tier, multiplier')
      .order('item_type').order('stat_key').order('tier'),
    db.from('game_config').select('value').eq('key', 'max_tier').single(),
    db.storage.from('icons').list('tier-frames'),
  ]);

  const rows = (scalingResult.data ?? []) as {
    id: string; item_type: string; stat_key: string;
    stat_label: string; tier: number; multiplier: number;
  }[];
  const maxTier = Number((configResult as { data: { value: number } | null }).data?.value ?? 10);

  // Build a map of tier → public URL for any frames already uploaded
  const frameFiles = framesResult.data ?? [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const frameUrls: Record<number, string> = {};
  for (let t = 1; t <= maxTier; t++) {
    const match = frameFiles.find(f => f.name.match(new RegExp(`^t${t}\\.`)));
    if (match) {
      const { data: { publicUrl } } = db.storage.from('icons').getPublicUrl(`tier-frames/${match.name}`);
      frameUrls[t] = publicUrl;
    }
  }

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

      <div className="border-t border-border pt-6">
        <h2 className="text-lg font-semibold text-heading mb-1">Tier Frames</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload a frame image for each tier (PNG or WebP recommended, square).
          These are stacked on top of item sprites in-game to show the item&apos;s tier visually.
        </p>
        <TierFramesSection maxTier={maxTier} frameUrls={frameUrls} />
      </div>
    </div>
  );
}
