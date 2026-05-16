import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { PAGE_CATEGORIES } from './page-categories';

export const metadata = { title: 'Formulas & Config — Admin' };

export default async function FormulasPage() {
  await requireAdmin();

  // Pull only the category column so we can display per-card setting counts
  const db = createAdminClient();
  const { data: countRows } = await db.from('game_config').select('category');

  const countsByDbCat = (countRows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-heading">Formulas & Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every tunable game constant, organised by system. Pick a category to view and edit its settings.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        {PAGE_CATEGORIES.map((cat) => {
          const settingCount = cat.dbCats.reduce(
            (sum, c) => sum + (countsByDbCat[c] ?? 0),
            0,
          );
          return (
            <Link
              key={cat.slug}
              href={`/admin/formulas/${cat.slug}`}
              className="group w-72 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-accent/10 transition-colors p-5 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl leading-none">{cat.icon}</span>
                <h2 className="font-bold text-heading text-base group-hover:text-primary transition-colors">
                  {cat.title}
                </h2>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed flex-1">{cat.desc}</p>

              <div className="flex items-end justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-1">
                  {cat.dbCats.map((c) => (
                    <span
                      key={c}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground font-mono"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap group-hover:text-primary transition-colors">
                  {settingCount} settings →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

