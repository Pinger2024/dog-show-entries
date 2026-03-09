'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Mail, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [wantsPassword, setWantsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordVisible, setShowPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn('google', { callbackUrl: '/onboarding' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (wantsPassword) {
      // Register with password
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? 'Unable to create account');
          setLoading(false);
          return;
        }

        // Auto sign in with the new password
        const result = await signIn('password', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Account created but sign-in failed. Please sign in manually.');
          setLoading(false);
          return;
        }

        window.location.href = '/onboarding';
      } catch {
        setError('Something went wrong. Please try again.');
        setLoading(false);
      }
    } else {
      // Magic link registration (existing flow)
      try {
        await signIn('resend', { email, callbackUrl: '/onboarding' });
        setEmailSent(true);
      } finally {
        setLoading(false);
      }
    }
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="size-6 text-primary" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">Check your email</CardTitle>
            <p className="mt-2 text-sm sm:text-[0.9375rem] text-muted-foreground">
              We&apos;ve sent a sign-in link to{' '}
              <span className="font-medium">{email}</span>. Click the link to
              create your account.
            </p>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="ghost" className="h-11 text-sm sm:text-[0.9375rem]" onClick={() => setEmailSent(false)}>
              Use a different email
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
            Create your free account to start entering shows
          </p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-lg sm:text-xl">Create Your Account</CardTitle>
            <CardDescription className="text-sm sm:text-[0.9375rem]">
              It only takes a moment. You can add your dogs and enter shows
              straight away.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Google sign-up */}
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem] font-medium"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <div className="size-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
              ) : (
                <GoogleIcon className="size-5" />
              )}
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  or continue with email
                </span>
              </div>
            </div>

            {/* Email + optional password */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm sm:text-[0.9375rem]">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  required
                  className="h-11 sm:h-12 text-sm sm:text-[0.9375rem]"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="wants-password"
                  checked={wantsPassword}
                  onCheckedChange={(checked) => {
                    setWantsPassword(checked === true);
                    if (!checked) {
                      setPassword('');
                      setConfirmPassword('');
                    }
                  }}
                />
                <Label htmlFor="wants-password" className="text-sm text-muted-foreground font-normal cursor-pointer">
                  Set a password (optional)
                </Label>
              </div>

              {wantsPassword && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm sm:text-[0.9375rem]">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPasswordVisible ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(''); }}
                        minLength={8}
                        maxLength={128}
                        required={wantsPassword}
                        className="h-11 sm:h-12 pr-10 text-sm sm:text-[0.9375rem]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordVisible(!showPasswordVisible)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center size-10 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPasswordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-sm sm:text-[0.9375rem]">Confirm password</Label>
                    <Input
                      id="confirm-password"
                      type={showPasswordVisible ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                      minLength={8}
                      maxLength={128}
                      required={wantsPassword}
                      className="h-11 sm:h-12 text-sm sm:text-[0.9375rem]"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <p>{error}</p>
                  {error.includes('signing in') && (
                    <Link href="/login" className="mt-1 block font-medium text-red-900 underline hover:no-underline">
                      Go to sign in page
                    </Link>
                  )}
                </div>
              )}

              <Button type="submit" className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]" disabled={loading}>
                {loading
                  ? (wantsPassword ? 'Creating account...' : 'Sending link...')
                  : (wantsPassword ? 'Create account' : 'Send sign-up link')
                }
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm sm:text-[0.9375rem] text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
