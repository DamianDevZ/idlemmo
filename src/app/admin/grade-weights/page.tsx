import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import GradeWeightsClient from './GradeWeightsClient';
import GradeMultipliersClient from './GradeMultipliersClient';
import WeaponPreviewClient from './WeaponPreviewClient';

export const metadata = { title: 'Grading System — Admin' };

const GRADE_WEIGHT_KEYS = ['grade_weight_s', 'grade_weight_a', 'grade_weight_b', 'grade_weight_c', 'grade_weight_d', 'grade_weight_f'] as const;
const GRADE_MULT_KEYS   = ['grade_mult_s',   'grade_mult_a',   'grade_mult_b',   'grade_mult_c',   'grade_mult_d',   'grade_mult_f'  ] as const;
const GRADE_WEIGHT_DEFAULTS: Record<string, number> = { grade_weight_s: 3, grade_weight_a: 7, grade_weight_b: 10, grade_weight_c: 15, grade_weight_d: 25, grade_weight_f: 40 };
const GRADE_MULT_DEFAULTS:   Record<string, number> = { grade_mult_s: 1.5, grade_mult_a: 1.4, grade_mult_b: 1.3, grade_mult_c: 1.2, grade_mult_d: 1.1, grade_mult_f: 1.0 };

export default async function GradeWeightsPage() {
  await requireAdmin();

  const db = createAdminClient();
  const [{ data }, { data: multData }, { data: weapons }, { data: scaling }, { data: maxTierRow }] = await Promise.all([
    db.from('game_config').select('key, value, default_value, min_value, max_value').in('key', [...GRADE_WEIGHT_KEYS]),
    db.from('game_config').select('key, value, default_value').in('key', [...GRADE_MULT_KEYS]),
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

  const rows = GRADE_WEIGHT_KEYS.map(k => {
    const row = (data ?? []).find(r => r.key === k);
    return {
      key: k,
      value: (row?.value as number) ?? GRADE_WEIGHT_DEFAULTS[k],
      default_value: (row?.default_value as number) ?? GRADE_WEIGHT_DEFAULTS[k],
      min_value: (row?.min_value as number) ?? 1,
      max_value: (row?.max_value as number) ?? 999,
    };
  });

  const multRows = GRADE_MULT_KEYS.map(k => {
    const row = (multData ?? []).find(r => r.key === k);
    return {
      key: k,
      value: (row?.value as number) ?? GRADE_MULT_DEFAULTS[k],
      default_value: (row?.default_value as number) ?? GRADE_MULT_DEFAULTS[k],
    };
  });

  const gradeMults = Object.fromEntries(multRows.map(r => [r.key.replace('grade_mult_', '').toUpperCase(), r.value])) as Record<string, number>;

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
        <h1 className="text-2xl font-bold text-heading">🎖️ Grading System</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control how likely each grade is to drop, and how much each grade amplifies weapon damage.
          Changes take effect immediately in live gameplay.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg bg-background border border-border px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Drop probability</p>
          <p className="text-sm text-body">
            On every weapon/armor/tool drop the server draws a grade from the probability weights.
            S is rarest, F is most common. Weights are normalised so only ratios matter.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Damage formula</p>
          <p className="text-sm text-body font-mono">
            dmg = weapon_base + round(stat_bonus × grade_mult)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Grade only multiplies the stat contribution (STR/DEX/INT bonus), not the flat weapon base.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GradeWeightsClient rows={rows} />
        <GradeMultipliersClient rows={multRows} />
      </div>

      <WeaponPreviewClient
        weapons={(weapons ?? []) as WeaponRow[]}
        tierScaling={(scaling ?? []) as ScalingRow[]}
        maxTier={maxTier}
        gradeMults={gradeMults}
      />
    </div>
  );
}
