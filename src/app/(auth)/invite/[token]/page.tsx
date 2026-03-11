'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  Loader2,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  LogIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const ROLE_DESCRIPTIONS: Record<string, string> = {
  secretary: 'Show Secretary — manage shows, view entries, and run events',
  steward: 'Ring Steward — assist at ringside during shows',
  judge: 'Judge — view assignments and manage judging duties',
};

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus, update: updateSession } = useSession();

  const {
    data: invitation,
    isLoading,
    error,
  } = trpc.invitations.getByToken.useQuery(
    { token: params.token },
    { retry: false }
  );

  const acceptInvitation = trpc.invitations.accept.useMutation({
    onSuccess: async (result) => {
      toast.success(`You're now a ${result.role}!`);
      await updateSession();
      router.push('/dashboard');
    },
    onError: (err) => {
      toast.error('Failed to complete setup', {
        description: err.message,
      });
    },
  });

  const isAuthenticated = sessionStatus === 'authenticated';
  const isLoadingSession = sessionStatus === 'loading';

  // Loading state
  if (isLoading || isLoadingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">
              Loading...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error / not found
  if (error || !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">
              Link Not Found
            </CardTitle>
            <CardDescription>
              This link is invalid or has been removed.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild>
              <Link href="/">Go to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Expired
  if (invitation.status === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="size-6 text-amber-700" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">
              Link Expired
            </CardTitle>
            <CardDescription>
              This link has expired. Please ask{' '}
              {invitation.inviterName} to send a new one.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild>
              <Link href="/">Go to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Already accepted
  if (invitation.status === 'accepted') {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-6 text-emerald-700" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">
              Already Set Up
            </CardTitle>
            <CardDescription>
              This account has already been set up.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Revoked
  if (invitation.status === 'revoked') {
    return (
      <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-gray-100">
              <AlertTriangle className="size-6 text-gray-500" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">
              Link Revoked
            </CardTitle>
            <CardDescription>
              This link has been cancelled by the sender.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild>
              <Link href="/">Go to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Pending — show accept UI
  const roleName =
    invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1);

  return (
    <div className="flex min-h-screen items-center justify-center px-3 sm:px-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Logo */}
        <div className="text-center">
          <Link
            href="/"
            className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-primary"
          >
            Remi
          </Link>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <UserPlus className="size-6 text-primary" />
            </div>
            <CardTitle className="font-serif text-lg sm:text-xl">
              You&apos;ve Been Added
            </CardTitle>
            <CardDescription className="text-sm sm:text-[0.9375rem]">
              <strong>{invitation.inviterName}</strong> has added you to
              Remi as a <strong>{roleName}</strong>. Sign up to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Role info */}
            <div className="rounded-lg bg-muted/50 p-3 sm:p-4">
              <p className="text-sm font-medium">{roleName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {ROLE_DESCRIPTIONS[invitation.role] ?? invitation.role}
              </p>
              {invitation.organisationName && (
                <p className="mt-2 text-sm">
                  Organisation:{' '}
                  <strong>{invitation.organisationName}</strong>
                </p>
              )}
            </div>

            {/* Personal message */}
            {invitation.message && (
              <div className="rounded-lg border-l-2 border-primary/30 bg-primary/5 p-3 sm:p-4">
                <p className="text-sm italic text-muted-foreground">
                  &ldquo;{invitation.message}&rdquo;
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  — {invitation.inviterName}
                </p>
              </div>
            )}

            {/* Action button */}
            {isAuthenticated ? (
              <Button
                className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]"
                onClick={() =>
                  acceptInvitation.mutate({ token: params.token })
                }
                disabled={acceptInvitation.isPending}
              >
                {acceptInvitation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Get Started
              </Button>
            ) : (
              <Button
                className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]"
                asChild
              >
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(`/invite/${params.token}`)}`}
                >
                  <LogIn className="size-4" />
                  Sign In to Get Started
                </Link>
              </Button>
            )}
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-xs text-muted-foreground">
              Added by {invitation.inviterName}
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
