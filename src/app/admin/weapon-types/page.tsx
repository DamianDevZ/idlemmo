import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { WeaponTypesClient } from './WeaponTypesClient';

export const dynamic = 'force-dynamic';

export default async function WeaponTypesPage() {
  await requireAdmin();
  const db = createAdminClient();
  const { data } = await db.from('weapon_types').select('id, name, display_name').order('display_name');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-heading">Weapon Types</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tags used to categorise weapons and restrict which Ultimates can be bound to them.
        </p>
      </div>
      <WeaponTypesClient initial={data ?? []} />
    </div>
  );
}
