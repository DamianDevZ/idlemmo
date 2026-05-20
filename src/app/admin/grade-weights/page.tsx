import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import GradeWeightsClient from './GradeWeightsClient';
import WeaponPreviewClient from './WeaponPreviewClient';

export const metadata = { title: 'Grade Weights — Admin' };

const GRADE_KEYS = ['grade_weight_s', 'grade_weight_a', 'grade_weight_b', 'grade_weight_c', 'grade_weight_d', 'grade_weight_f'] as const;
const GRADE_DEFAULTS: Record<string, number> = { grade_weight_s: 3, grade_weight_a: 7, grade_weight_b: 10, grade_weight_c: 15, grade_weight_d: 25, grade_weight_f: 40 };

export default async function GradeWeightsPage() {
  await requireAdmin();

  const db = createAdminClient();
  const [{ data }, { data: weapons }, { data: scaling }, { data: maxTierRow }] = await Promise.all([
    db.from('game_config').select('key, value, default_value, min_value, max_value').in('key', [...GRADE_KEYS]),
    db.from('item_definitions')
      .select('id, display_name, base_damage, attack_speed, primary_scaling_attr, is_tiered, tiered_stats')
      .eq('type', 'weapon')
      .order('display_name'),
    db.from('tier_scaling_config')
      .select('stat_key, tier, multiplier')
      .eq('item_type', 'weapon')
      .order('stat_key').order('tier'),
    db.from('game_config').select('value').eq('key', 'max_tier').single(),
  ]);

  const rows = GRADE_KEYS.map(k => {
    const row = (data ?? []).find(r => r.key === k);
    return {
      key: k,
      value: (row?.value as number) ?? GRADE_DEFAULTS[k],
      default_value: (row?.default_value as number) ?? GRADE_DEFAULTS[k],
      min_value: (row?.min_value as number) ?? 1,
      max_value: (row?.max_value as number) ?? 999,
    };
  });

  const maxTier = Number((maxTierRow as { value: number } | null)?.value ?? 5);

  type WeaponRow = {
    id: string; display_name: string; base_damage: number | null;
    attack_speed: number; primary_scaling_attr: string | null;
    is_tiered: boolean; tiered_stats: string[];
  };
  type ScalingRow = { stat_key: string; tier: number; multiplier: number };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin" className="text-muted-foreground hover:text-body transition-colors">
          ← Admin
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-heading">⚗️ Equipment Grade Weights</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Relative probability weights for each quality grade when equipment drops from enemies.
          Higher weight = more common. Weights are normalised at roll time so only their ratios matter.
          Individual items can override these in the Items admin.
        </p>
      </div>

      <div className="rounded-lg bg-background border border-border px-4 py-3.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">How it works</p>
        <p className="text-sm text-body font-mono whitespace-pre-line leading-relaxed">
          {`grade = weightedRandom({ S, A, B, C, D, F })\n\nOn every weapon/armor/tool drop the server draws a grade from these weights.\nS is rarest · F is most common · weights are normalised before drawing.`}
        </p>
      </div>

      <GradeWeightsClient rows={rows} />

      <WeaponPreviewClient
        weapons={(weapons ?? []) as WeaponRow[]}
        tierScaling={(scaling ?? []) as ScalingRow[]}
        maxTier={maxTier}
      />
    </div>
  );
}
