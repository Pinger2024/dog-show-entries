'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordVisible, setShowPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-red-100">
              <XCircle className="size-6 text-red-600" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">Invalid Link</CardTitle>
            <p className="mt-2 text-sm sm:text-[0.9375rem] text-muted-foreground">
              This password reset link is invalid or has expired.
            </p>
          </CardHeader>
          <CardFooter className="flex-col gap-2">
            <Button asChild className="h-11 w-full text-sm sm:text-[0.9375rem]">
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-primary hover:underline">
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="size-6 text-green-600" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">Password Reset</CardTitle>
            <p className="mt-2 text-sm sm:text-[0.9375rem] text-muted-foreground">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild className="h-11 w-full text-sm sm:text-[0.9375rem]">
              <Link href="/login?reset=success">Sign in</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'This reset link is invalid or has expired. Please request a new one.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
      <div className="w-full max-w-sm space-y-4 sm:space-y-5">
        <div className="text-center">
          <Link href="/" className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            Remi
          </Link>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-lg sm:text-xl">Set a new password</CardTitle>
            <p className="mt-2 text-sm sm:text-[0.9375rem] text-muted-foreground">
              Choose a new password for your account. Must be at least 8 characters.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm sm:text-[0.9375rem]">New password</Label>
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
                    required
                    className="h-11 sm:h-12 pr-10 text-sm sm:text-[0.9375rem]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordVisible(!showPasswordVisible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPasswordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm sm:text-[0.9375rem]">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type={showPasswordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  minLength={8}
                  maxLength={128}
                  required
                  className="h-11 sm:h-12 text-sm sm:text-[0.9375rem]"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset password'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <Link href="/login" className="text-sm sm:text-[0.9375rem] text-muted-foreground hover:text-primary hover:underline">
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
