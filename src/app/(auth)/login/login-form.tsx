'use client';

import { useState, useRef, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Eye, EyeOff } from 'lucide-react';
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

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';
  const verify = searchParams.get('verify');
  const resetSuccess = searchParams.get('reset') === 'success';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(!!verify);
  const [error, setError] = useState('');
  const [showPasswordVisible, setShowPasswordVisible] = useState(false);
  const hiddenPasswordRef = useRef<HTMLInputElement>(null);

  // Detect browser autofill on the hidden password field
  useEffect(() => {
    const el = hiddenPasswordRef.current;
    if (!el) return;

    function handleAutofill() {
      // Browser autofilled the password — reveal the password UI
      setShowPasswordField(true);
      if (el && el.value) {
        setPassword(el.value);
      }
    }

    // Chrome/Safari fire an animationstart event when autofill styles kick in
    el.addEventListener('animationstart', handleAutofill);

    // Fallback: check after a short delay for autofilled values
    const timer = setTimeout(() => {
      if (el && el.value) {
        handleAutofill();
      }
    }, 600);

    return () => {
      el.removeEventListener('animationstart', handleAutofill);
      clearTimeout(timer);
    };
  }, []);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn('google', { callbackUrl });
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (showPasswordField && password) {
      // Password login
      try {
        const result = await signIn('password', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Incorrect email or password');
          setLoading(false);
          return;
        }

        // Successful login — redirect
        window.location.href = callbackUrl;
      } catch {
        setError('Something went wrong. Please try again.');
        setLoading(false);
      }
    } else {
      // Magic link
      try {
        await signIn('resend', { email, callbackUrl });
        setEmailSent(true);
      } finally {
        setLoading(false);
      }
    }
  }

  function handleSendMagicLink() {
    setError('');
    setShowPasswordField(false);
    setPassword('');
    // Trigger magic link send
    setLoading(true);
    signIn('resend', { email, callbackUrl })
      .then(() => setEmailSent(true))
      .finally(() => setLoading(false));
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
              We&apos;ve sent a sign-in link to your email address. Click the
              link to sign in.
            </p>
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

        {resetSuccess && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Password reset successfully. You can now sign in with your new password.
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 pt-6">
            {/* Google sign-in */}
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

            {/* Hidden password field for autofill detection */}
            {!showPasswordField && (
              <input
                ref={hiddenPasswordRef}
                type="password"
                autoComplete="current-password"
                tabIndex={-1}
                aria-hidden="true"
                className="absolute h-0 w-0 opacity-0"
                onChange={(e) => {
                  if (e.target.value) {
                    setShowPasswordField(true);
                    setPassword(e.target.value);
                  }
                }}
              />
            )}

            {/* Email + optional password */}
            <form onSubmit={handleEmailSignIn} className="space-y-4">
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

              {showPasswordField && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm sm:text-[0.9375rem]">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPasswordVisible ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
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
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]" disabled={loading}>
                {loading
                  ? (showPasswordField && password ? 'Signing in...' : 'Sending link...')
                  : (showPasswordField && password ? 'Sign in' : 'Send sign-in link')
                }
              </Button>

              {showPasswordField ? (
                <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Link href="/forgot-password" className="hover:text-primary hover:underline">
                    Forgot password?
                  </Link>
                  <span>|</span>
                  <button
                    type="button"
                    onClick={handleSendMagicLink}
                    className="hover:text-primary hover:underline"
                    disabled={loading || !email}
                  >
                    Send magic link instead
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowPasswordField(true)}
                    className="text-sm text-muted-foreground hover:text-primary hover:underline"
                  >
                    I have a password
                  </button>
                </div>
              )}
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm sm:text-[0.9375rem] text-muted-foreground">
              New to Remi?{' '}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Create a free account
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
