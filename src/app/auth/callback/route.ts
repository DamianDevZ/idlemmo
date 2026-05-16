import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Supabase redirects here after the user clicks the confirmation link in their email.
// We exchange the one-time code for a session, then send the user into the game.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/game';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send back to login with a readable message
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('Could not confirm your account. The link may have expired.')}`,
  );
}
