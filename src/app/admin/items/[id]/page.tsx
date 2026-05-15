import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { ItemForm } from '@/components/admin/ItemForm';
import Link from 'next/link';

const BLANK = {
  name: '', display_name: '', type: 'material', rarity: 'common',
  description: '', stackable: true, equipment_tier: null,
  base_damage: null, base_defense: null, primary_damage_type: null,
  material_type: null, primary_scaling_attr: null, primary_scaling_grade: null,
  secondary_scaling_attr: null, secondary_scaling_grade: null, image_url: null,
};

export default async function ItemEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === 'new';

  let item = BLANK;
  if (!isNew) {
    const db = createAdminClient();
    const { data } = await db.from('item_definitions').select('*').eq('id', id).single();
    if (!data) notFound();
    item = data;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/items" className="text-sm text-muted-foreground hover:text-body transition-colors">← Items</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold text-heading">{isNew ? 'New Item' : item.display_name}</h1>
      </div>
      <ItemForm initial={{ ...item, id: isNew ? undefined : id } as Parameters<typeof ItemForm>[0]['initial']} />
    </div>
  );
}
