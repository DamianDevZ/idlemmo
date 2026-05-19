import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TierScalingClient } from './TierScalingClient';
import { TierFramesSection } from './TierFramesSection';
import { RecipeSettingsSection } from './RecipeSettingsSection';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TierScalingPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [scalingResult, configResult, framesResult, previewItemsResult, previewEnemiesResult, recipeSettingsResult, recipeScrollResult] = await Promise.all([
    db.from('tier_scaling_config')
      .select('id, item_type, stat_key, stat_label, tier, multiplier')
      .order('item_type').order('stat_key').order('tier'),
    db.from('game_config').select('value').eq('key', 'max_tier').single(),
    db.storage.from('icons').list('tier-frames'),
    db.from('item_definitions')
      .select('id, display_name, type, tiered_stats, base_damage, base_defense, tool_config')
      .neq('tiered_stats', '{}')
      .order('display_name'),
    db.from('enemies')
      .select('id, display_name, tiered_stats, base_hp, base_attack')
      .neq('tiered_stats', '{}')
      .order('display_name'),
    db.from('app_settings').select('value').eq('key', 'recipe_suffix').single(),
    db.storage.from('icons').list('', { search: 'recipe-scroll' }),
  ]);

  const rows = (scalingResult.data ?? []) as {
    id: string; item_type: string; stat_key: string;
    stat_label: string; tier: number; multiplier: number;
  }[];
  const maxTier = Number((configResult as { data: { value: number } | null }).data?.value ?? 10);

  type RawItem = { id: string; display_name: string; type: string; tiered_stats: string[] | null; base_damage: number | null; base_defense: number | null; tool_config: Record<string, number> | null };
  type RawEnemy = { id: string; display_name: string; tiered_stats: string[] | null; base_hp: number; base_attack: number };
  const previewItems: Array<{ id: string; display_name: string; item_type: string; tiered_stats: string[]; base_stats: Record<string, number> }> = [
    ...((previewItemsResult.data ?? []) as RawItem[]).map(item => ({
      id: item.id,
      display_name: item.display_name,
      item_type: item.type,
      tiered_stats: item.tiered_stats ?? [],
      base_stats: {
        ...(item.base_damage   != null ? { base_damage:   item.base_damage }   : {}),
        ...(item.base_defense  != null ? { base_defense:  item.base_defense }  : {}),
        ...((item.tool_config as Record<string, number> | null)?.yield_min != null ? { yield_min: (item.tool_config as Record<string, number>).yield_min } : {}),
        ...((item.tool_config as Record<string, number> | null)?.yield_max != null ? { yield_max: (item.tool_config as Record<string, number>).yield_max } : {}),
      },
    })),
    ...((previewEnemiesResult.data ?? []) as RawEnemy[]).map(e => ({
      id: e.id,
      display_name: e.display_name,
      item_type: 'enemy',
      tiered_stats: e.tiered_stats ?? [],
      base_stats: { base_hp: e.base_hp, base_attack: e.base_attack },
    })),
  ];

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

  const recipeSuffix = (recipeSettingsResult.data as { value: string } | null)?.value ?? 'Scroll';
  const hasScrollBg = (recipeScrollResult.data ?? []).some(f => f.name.startsWith('recipe-scroll'));
  const scrollBgUrl = hasScrollBg
    ? `${supabaseUrl}/storage/v1/object/public/icons/recipe-scroll.png`
    : null;

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
      </p>
      <TierScalingClient rows={rows} maxTier={maxTier} previewItems={previewItems} />

      <div className="border-t border-border pt-6">
        <h2 className="text-lg font-semibold text-heading mb-1">Tier Frames</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload a frame image for each tier (PNG or WebP recommended, square).
          These are stacked on top of item sprites in-game to show the item&apos;s tier visually.
        </p>
        <TierFramesSection maxTier={maxTier} frameUrls={frameUrls} />
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="text-lg font-semibold text-heading mb-1">Recipe Items</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Configure how recipe scroll items look and are named. When you make an item craftable,
          a matching recipe scroll item is created automatically using these settings.
        </p>
        <RecipeSettingsSection initialSuffix={recipeSuffix} initialScrollBgUrl={scrollBgUrl} />
      </div>
    </div>
  );
}
