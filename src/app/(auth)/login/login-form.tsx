'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogIn, Shield, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const demoUsers = [
  {
    email: 'michael@prometheus-it.com',
    name: 'Michael James',
    role: 'Admin',
    icon: Shield,
    description: 'Full access — dashboard, secretary tools, all settings',
  },
  {
    email: 'mandy@hundarkgsd.co.uk',
    name: 'Amanda',
    role: 'Secretary',
    icon: User,
    description: 'Secretary & exhibitor — manage shows, enter dogs',
  },
];

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';
  const verify = searchParams.get('verify');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(!!verify);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn('resend', { email, callbackUrl });
      setEmailSent(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(demoEmail: string) {
    setDemoLoading(demoEmail);
    await signIn('demo', {
      email: demoEmail,
      callbackUrl,
    });
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-lg sm:text-xl">Check your email</CardTitle>
            <CardDescription className="text-sm sm:text-[0.9375rem]">
              We&apos;ve sent a sign-in link to your email address. Click the
              link to sign in.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="ghost" className="h-11 text-sm sm:text-[0.9375rem]" onClick={() => setEmailSent(false)}>
              Try a different email
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
      <div className="w-full max-w-sm space-y-4 sm:space-y-5">
        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            Remi
          </Link>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            Sign in to manage your dogs and entries
          </p>
        </div>

        {/* Demo login card */}
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader className="pb-3 text-center">
            <CardTitle className="text-base sm:text-lg">Demo Login</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Jump straight in — pick a role to explore
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {demoUsers.map((user) => (
              <button
                key={user.email}
                onClick={() => handleDemoLogin(user.email)}
                disabled={demoLoading !== null}
                className="flex w-full items-center gap-2.5 sm:gap-3 rounded-lg border bg-card p-2.5 sm:p-3.5 text-left transition-all hover:border-primary/30 hover:shadow-sm disabled:opacity-60"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <user.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-[0.9375rem] font-semibold">{user.name}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {user.role}
                    </span>
                  </div>
                  <p className="truncate text-xs sm:text-sm text-muted-foreground">
                    {user.description}
                  </p>
                </div>
                {demoLoading === user.email ? (
                  <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <LogIn className="size-4 shrink-0 text-muted-foreground/40" />
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Standard login card */}
        <Card>
          <CardHeader className="pb-3 text-center">
            <CardTitle className="text-sm sm:text-base text-muted-foreground">
              Or sign in with email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm sm:text-[0.9375rem]">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 sm:h-12 text-sm sm:text-[0.9375rem]"
                />
              </div>
              <Button type="submit" className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]" disabled={loading}>
                {loading ? 'Sending link...' : 'Send sign-in link'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm sm:text-[0.9375rem] text-muted-foreground">
              New to Remi?{' '}
              <Link href="/register" className="text-primary hover:underline">
                Create a free account
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
