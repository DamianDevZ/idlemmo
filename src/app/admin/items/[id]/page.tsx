import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { ItemForm } from '@/components/admin/ItemForm';
import type { RecipeFormData } from '@/features/admin/item-actions';
import type { TierScalingRow } from '@/features/admin/tier-scaling-actions';
import Link from 'next/link';

const BLANK = {
  name: '', display_name: '', type: 'weapon',
  description: '', stackable: false, equipment_tier: 1,
  base_damage: null, base_defense: null, primary_damage_type: null,
  material_type: null, primary_scaling_attr: 'str',
  secondary_scaling_attr: null,
  image_url: null, resistances: {},
  required_mastery_skill_id: null, required_mastery_level: 1,
  material_subtype: null, gathering_skill_id: null,
  is_tiered: true,
  tiered_stats: [],
  consumable_effects: [],
  tool_config: {},
  weapon_type_id: null,
  compatible_weapon_type_ids: [],
  attack_speed: 1.0,
  tool_slot: null,
  grade_weights: null,
};

export default async function ItemEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; subtype?: string; returnTo?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { type: qType, subtype: qSubtype, returnTo: qReturnTo } = await searchParams;
  // Only allow redirects to internal admin paths to prevent open redirects
  const safeReturnTo = typeof qReturnTo === 'string' && qReturnTo.startsWith('/admin/') ? qReturnTo : '/admin/items';
  const isNew = id === 'new';
  const db = createAdminClient();

  // Load item, skills, material items, existing recipe, weapon types, tier scaling, global config,
  // recipe suffix setting, and the recipe scroll item linked to this item (if any).
  const [itemResult, skillsResult, materialsResult, recipeResult, weaponTypesResult, tierScalingResult, configResult, recipeSuffixResult, recipeItemResult] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : db.from('item_definitions').select('*').eq('id', id).single(),
    db.from('skills').select('id, name, display_name, skill_categories(name)').order('display_name'),
    db.from('item_definitions').select('id, name, display_name, equipment_tier, is_tiered, material_subtype, type').order('display_name'),
    isNew
      ? Promise.resolve({ data: [] })
      : db.from('recipes').select('*').eq('output_item_id', id).order('output_tier'),
    db.from('weapon_types').select('id, name, display_name').order('display_name'),
    db.from('tier_scaling_config').select('id, item_type, stat_key, stat_label, tier, multiplier').order('item_type').order('stat_key').order('tier'),
    db.from('game_config').select('value').eq('key', 'max_tier').single(),
    db.from('app_settings').select('value').eq('key', 'recipe_suffix').single(),
    isNew
      ? Promise.resolve({ data: null })
      : db.from('item_definitions').select('id, display_name').eq('recipe_for_item_id', id).limit(1).maybeSingle(),
  ]);

  const maxTier = Number((configResult as { data: { value: number } | null }).data?.value ?? 5);
  const weaponTypes = (weaponTypesResult.data ?? []) as { id: string; name: string; display_name: string }[];
  const tierScaling = (tierScalingResult.data ?? []) as TierScalingRow[];
  const recipeSuffix = (recipeSuffixResult.data as { value: string } | null)?.value ?? 'Scroll';
  const existingRecipeItem = (recipeItemResult.data as { id: string; display_name: string } | null) ?? null;

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
    type: (m as unknown as { type: string }).type,
    equipment_tier: m.equipment_tier as number | null,
    is_tiered: (m as unknown as { is_tiered: boolean }).is_tiered,
    material_subtype: (m as unknown as { material_subtype: string | null }).material_subtype ?? null,
  }));

  const recipes: RecipeFormData[] = (recipeResult.data ?? []).map(r => ({
    id:                   r.id,
    display_name:         r.display_name,
    output_quantity:      r.output_quantity,
    required_skill_id:    r.required_skill_id,
    required_skill_level: r.required_skill_level,
    ingredients:          (r.ingredients ?? []) as RecipeFormData['ingredients'],
    craft_time_seconds:   r.craft_time_seconds,
    output_tier:          (r as unknown as { output_tier?: number }).output_tier ?? 0,
  }));


  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={safeReturnTo} className="text-sm text-muted-foreground hover:text-body transition-colors">← Items</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold text-heading">{isNew ? 'New Item' : item.display_name}</h1>
      </div>
      <ItemForm
        initial={{ ...item, id: isNew ? undefined : id, tiered_stats: item.tiered_stats ?? [] }}
        recipes={recipes}
        skills={skills}
        materialItems={materialItems}
        weaponTypes={weaponTypes}
        maxTier={maxTier}
        tierScaling={tierScaling}
        returnTo={safeReturnTo}
        recipeSuffix={recipeSuffix}
        existingRecipeItem={existingRecipeItem}
      />
    </div>
  );
}
