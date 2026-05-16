import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import FormulasClient, { type ConfigRow } from '../FormulasClient';
import { PAGE_CAT_MAP } from '../page-categories';

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = PAGE_CAT_MAP[category as keyof typeof PAGE_CAT_MAP];
  if (!cat) return { title: 'Not Found' };
  return { title: `${cat.title} — Formulas & Config` };
}

export default async function FormulasCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  await requireAdmin();
  const { category } = await params;

  const cat = PAGE_CAT_MAP[category as keyof typeof PAGE_CAT_MAP];
  if (!cat) notFound();

  const db = createAdminClient();
  const { data } = await db
    .from('game_config')
    .select('*')
    .in('category', [...cat.dbCats])
    .order('category')
    .order('sort_order');

  const config: ConfigRow[] = (data as ConfigRow[]) ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/formulas"
          className="text-muted-foreground hover:text-body transition-colors"
        >
          ← Formulas & Config
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-heading font-medium">
          {cat.icon} {cat.title}
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-heading">
          {cat.icon} {cat.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{cat.desc}</p>
      </div>

      <FormulasClient initialConfig={config} />
    </div>
  );
}
