import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import FormulasOverview from './FormulasOverview';
import CategoryDetail, { type ConfigRow } from './CategoryDetail';

export const metadata = { title: 'Formulas & Config — Admin' };

export default async function FormulasPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireAdmin();
  const { category } = await searchParams;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('game_config')
    .select('*')
    .order('category')
    .order('sort_order');

  const config: ConfigRow[] = error ? [] : (data as ConfigRow[]) ?? [];

  if (category) {
    const rows = config.filter(r => r.category === category);
    return (
      <div className="space-y-5 max-w-3xl">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/formulas" className="hover:text-foreground transition-colors">
            Formulas & Config
          </Link>
          <span>/</span>
          <span className="text-foreground capitalize">
            {category.replace(/_/g, ' ')}
          </span>
        </div>
        <CategoryDetail rows={rows} category={category} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-heading">Formulas & Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every tunable game constant organised by system. Click a card to view formulas and edit values.
        </p>
      </div>
      <FormulasOverview config={config} />
    </div>
  );
}
