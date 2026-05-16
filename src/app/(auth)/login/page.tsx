'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setUnconfirmedEmail('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      // Supabase returns this exact message for unconfirmed accounts
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setUnconfirmedEmail(email);
      }
      setLoading(false);
      return;
    }

    router.push('/game');
    router.refresh();
  }

  async function handleResend() {
    if (!unconfirmedEmail || resendState !== 'idle') return;
    setResendState('sending');
    const supabase = createClient();
    await supabase.auth.resend({
      type: 'signup',
      email: unconfirmedEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResendState('sent');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary tracking-widest uppercase">
            Idle MMO
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your adventure awaits
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your account credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="hero@realm.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="space-y-2">
                  <p className="text-destructive text-sm">{error}</p>
                  {unconfirmedEmail && (
                    resendState === 'sent' ? (
                      <p className="text-sm text-muted-foreground">
                        ✅ New confirmation email sent — check your inbox.
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendState === 'sending'}
                        className="text-sm text-primary hover:underline disabled:opacity-50"
                      >
                        {resendState === 'sending' ? 'Sending…' : 'Resend confirmation email'}
                      </button>
                    )
                  )}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Enter the Realm'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              No account?{' '}
              <Link href="/register" className="text-primary hover:underline">
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
