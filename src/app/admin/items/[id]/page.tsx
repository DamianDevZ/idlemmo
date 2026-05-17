import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { ItemForm } from '@/components/admin/ItemForm';
import type { RecipeFormData } from '@/features/admin/item-actions';
import Link from 'next/link';

const BLANK = {
  name: '', display_name: '', type: 'weapon', rarity: 'common',
  description: '', stackable: false, equipment_tier: 1,
  base_damage: null, base_defense: null, primary_damage_type: null,
  material_type: null, primary_scaling_attr: 'str', primary_scaling_grade: 'F',
  secondary_scaling_attr: null, secondary_scaling_grade: null, image_url: null,
  resistances: {},
};

export default async function ItemEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === 'new';
  const db = createAdminClient();

  // Load item, skills, and existing recipe in parallel
  const [itemResult, skillsResult, recipeResult] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : db.from('item_definitions').select('*').eq('id', id).single(),
    db.from('skills').select('id, name, display_name').order('display_name'),
    isNew
      ? Promise.resolve({ data: null })
      : db.from('recipes').select('*').eq('output_item_id', id).maybeSingle(),
  ]);

  if (!isNew && !itemResult.data) notFound();

  const item = itemResult.data ?? BLANK;
  const skills = skillsResult.data ?? [];

  let recipe: RecipeFormData | null = null;
  if (recipeResult.data) {
    const r = recipeResult.data;
    recipe = {
      id:                   r.id,
      display_name:         r.display_name,
      output_quantity:      r.output_quantity,
      required_skill_id:    r.required_skill_id,
      required_skill_level: r.required_skill_level,
      ingredients:          r.ingredients ?? [],
      base_success_chance:  r.base_success_chance,
      craft_time_seconds:   r.craft_time_seconds,
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/items" className="text-sm text-muted-foreground hover:text-body transition-colors">← Items</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold text-heading">{isNew ? 'New Item' : item.display_name}</h1>
      </div>
      <ItemForm
        initial={{ ...item, id: isNew ? undefined : id }}
        recipe={recipe}
        skills={skills}
      />
    </div>
  );
}
