import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PresetsClient } from '@/components/admin/PresetsClient';

export default async function AdminPresetsPage() {
  await requireAdmin();
  const db = createAdminClient();
  const { data: presets } = await db.from('armor_presets').select('*').order('id');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-heading">Armor Presets</h1>
        <p className="text-sm text-muted-foreground">
          Resistance values: positive = % damage reduced, negative = weakness (takes more).
          Damage types: slash, blunt, bleed, pierce, fire, ice, lightning, poison.
        </p>
      </div>
      <PresetsClient presets={presets ?? []} />
    </div>
  );
}
