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
  secondary_scaling_attr: null, secondary_scaling_grade: null,
  image_url: null, resistances: {},
  required_mastery_skill_id: null, required_mastery_level: 1,
  material_subtype: null, gathering_skill_id: null,
  is_tiered: true,
};

export default async function ItemEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; subtype?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { type: qType, subtype: qSubtype } = await searchParams;
  const isNew = id === 'new';
  const db = createAdminClient();

  // Load item, skills, material items, existing recipe, and global config in parallel
  const [itemResult, skillsResult, materialsResult, recipeResult, configResult] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : db.from('item_definitions').select('*').eq('id', id).single(),
    db.from('skills').select('id, name, display_name, skill_categories(name)').order('display_name'),
    db.from('item_definitions').select('id, name, display_name, equipment_tier, is_tiered').eq('type', 'material').order('display_name'),
    isNew
      ? Promise.resolve({ data: null })
      : db.from('recipes').select('*').eq('output_item_id', id).maybeSingle(),
    db.from('game_config').select('value').eq('key', 'max_tier').single(),
  ]);

  const maxTier = Number((configResult as { data: { value: number } | null }).data?.value ?? 5);

  if (!isNew && !itemResult.data) notFound();

  // When creating a new item, apply type/subtype from URL query params
  const blankOverride = isNew && qType ? {
    ...BLANK,
    type: qType,
    ...(qSubtype ? { material_subtype: qSubtype } : {}),
    // Materials are always stackable
    ...(qType === 'material' ? { stackable: true, equipment_tier: null } : {}),
  } : BLANK;

  const item = itemResult.data ?? blankOverride;
  // Normalize the nested join result into a flat shape for ItemForm
  const skills = (skillsResult.data ?? []).map(s => ({
    id: s.id,
    name: s.name,
    display_name: s.display_name,
    category: (s.skill_categories as unknown as { name: string } | null)?.name ?? '',
  }));

  const materialItems = (materialsResult.data ?? []).map(m => ({
    id: m.id,
    name: m.name,
    display_name: m.display_name,
    equipment_tier: m.equipment_tier as number | null,
    is_tiered: (m as unknown as { is_tiered: boolean }).is_tiered,
  }));

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
      craft_time_seconds:   r.craft_time_seconds,
    };
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/items" className="text-sm text-muted-foreground hover:text-body transition-colors">← Items</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-heading">{isNew ? 'New Item' : item.display_name}</h1>
      </div>
      <ItemForm
        initial={{ ...item, id: isNew ? undefined : id }}
        recipe={recipe}
        skills={skills}
        materialItems={materialItems}
        maxTier={maxTier}
      />
    </div>
  );
}
