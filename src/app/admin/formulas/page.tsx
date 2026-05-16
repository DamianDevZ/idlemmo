import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import FormulasClient, { type ConfigRow } from './FormulasClient';

export const metadata = { title: 'Formulas & Config — Admin' };

export default async function FormulasPage() {
  await requireAdmin();

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('game_config')
    .select('*')
    .order('category')
    .order('sort_order');

  const config: ConfigRow[] = (data as ConfigRow[]) ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-heading">Formulas & Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every tunable game constant, grouped by system. Edit a value and hit{' '}
          <strong>Save Changes</strong> — the game picks it up within 60 seconds.
        </p>
      </div>
      <FormulasClient initialConfig={config} />
    </div>
  );
}

