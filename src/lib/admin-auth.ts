import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Verifies the current user is an admin.
 * Uses app_metadata.is_admin (set server-side, not user-editable).
 * Redirects to /login if unauthenticated, throws forbidden if not admin.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const isAdmin = user.app_metadata?.is_admin === true;
  if (!isAdmin) {
    redirect('/game');
  }

  return user;
}
