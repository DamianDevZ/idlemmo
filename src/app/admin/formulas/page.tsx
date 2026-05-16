import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import FormulasClient, { type ConfigRow } from './FormulasClient';

export const metadata = { title: 'Formulas & Config — Admin' };

export default async function FormulasPage() {
  await requireAdmin();

  const supabase = createAdminClient();

  // Gracefully handle the case where the table hasn't been created yet
  const { data, error } = await supabase
    .from('game_config')
    .select('*')
    .order('category')
    .order('sort_order');

  const config: ConfigRow[] = error ? [] : (data as ConfigRow[]) ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-heading">Formulas & Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every tunable game constant — formulas, multipliers, thresholds — organised by system.
          Edit any value and hit <strong>Save Changes</strong> to persist it to the database.
        </p>
      </div>

      <FormulasClient initialConfig={config} />
    </div>
  );
}
