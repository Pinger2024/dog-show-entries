'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Always show success to prevent enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="size-6 text-primary" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">Check your email</CardTitle>
            <p className="mt-2 text-sm sm:text-[0.9375rem] text-muted-foreground">
              If an account exists for <span className="font-medium">{email}</span>,
              we&apos;ve sent a password reset link. The link expires in 1 hour.
            </p>
          </CardHeader>
          <CardFooter className="flex-col gap-2">
            <Button variant="ghost" className="h-11 text-sm sm:text-[0.9375rem]" onClick={() => setSent(false)}>
              Try a different email
            </Button>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-primary hover:underline">
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
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
            <CardTitle className="font-serif text-lg sm:text-xl">Forgot your password?</CardTitle>
            <p className="mt-2 text-sm sm:text-[0.9375rem] text-muted-foreground">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
          </CardHeader>
          <CardContent>
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
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 sm:h-12 text-sm sm:text-[0.9375rem]"
                />
              </div>
              <Button type="submit" className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]" disabled={loading}>
                {loading ? 'Sending...' : 'Send reset link'}
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
