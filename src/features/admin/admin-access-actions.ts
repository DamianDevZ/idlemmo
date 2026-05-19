'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function setAdminAccess(userId: string, grant: boolean) {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { is_admin: grant },
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/players');
}
