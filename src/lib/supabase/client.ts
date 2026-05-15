import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase browser client — use in Client Components only.
 * The anon key is safe to expose; Row Level Security enforces data access.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
