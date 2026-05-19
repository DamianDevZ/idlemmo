import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { SkillsAdminClient } from './SkillsAdminClient';

export const dynamic = 'force-dynamic';

export default async function SkillsAdminPage() {
  await requireAdmin();
  const db = createAdminClient();

  const { data } = await db
    .from('skills')
    .select('id, name, display_name, description, primary_attribute, skill_categories(name, display_name)')
    .order('primary_attribute')
    .order('display_name');

  type RawSkill = {
    id: string;
    name: string;
    display_name: string;
    description: string;
    primary_attribute: string;
    skill_categories: { name: string; display_name: string } | null;
  };

  const skills = (data ?? []) as unknown as RawSkill[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-heading">Skills</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit display names and descriptions. New skills must be wired in code before they matter.
        </p>
      </div>
      <SkillsAdminClient initial={skills} />
    </div>
  );
}
