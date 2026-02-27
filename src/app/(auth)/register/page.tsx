'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
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

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Use the demo credentials provider for now
      await signIn('demo', {
        email,
        callbackUrl: '/dashboard?welcome=true',
      });
      setEmailSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-xl">Check your email</CardTitle>
            <CardDescription className="text-[0.9375rem]">
              We&apos;ve sent a sign-in link to{' '}
              <span className="font-medium">{email}</span>.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="ghost" className="h-11 text-[0.9375rem]" onClick={() => setEmailSent(false)}>
              Use a different email
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5">
        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="font-serif text-3xl font-bold tracking-tight text-primary">
            Remi
          </Link>
          <p className="mt-2 text-muted-foreground">
            Create your free account to start entering shows
          </p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-xl">Create Your Account</CardTitle>
            <CardDescription className="text-[0.9375rem]">
              It only takes a moment. You can add your dogs and enter shows
              straight away.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-[0.9375rem]">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g. Jane Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-12 text-[0.9375rem]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[0.9375rem]">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 text-[0.9375rem]"
                />
              </div>
              <Button type="submit" className="h-12 w-full text-[0.9375rem]" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? 'Creating account...' : 'Create Free Account'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <p className="text-[0.9375rem] text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
            <p className="text-sm text-center text-muted-foreground/70">
              For demo purposes, use one of the pre-configured accounts on the{' '}
              <Link href="/login" className="text-primary hover:underline">
                login page
              </Link>.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
