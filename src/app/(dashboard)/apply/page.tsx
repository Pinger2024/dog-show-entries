'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ClipboardCheck,
  XCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ClubApplicationForm } from '@/components/club-application-form';
import { trpc } from '@/lib/trpc/client';

export default function ApplyPage() {
  const { data: session, status: sessionStatus } = useSession();
  const utils = trpc.useUtils();
  const userRole = session?.user?.role;

  const { data: application, isLoading } =
    trpc.applications.myApplication.useQuery();

  // Show loading spinner while session or application data is loading
  if (sessionStatus === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not an exhibitor — shouldn't be here
  if (userRole && userRole !== 'exhibitor') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CheckCircle2 className="size-7 text-primary" />
        <h2 className="mt-3 text-lg font-semibold">
          You already have {userRole} access
        </h2>
        <p className="mt-1.5 text-muted-foreground">
          You already have elevated permissions on Remi.
        </p>
        <Button className="mt-5" asChild>
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    );
  }

  // Already registered a club — show success state
  if (application?.status === 'approved') {
    return (
      <div className="mx-auto max-w-lg space-y-8 pb-16 md:pb-0">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
            Club Registered
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            You&apos;re all set to manage shows.
          </p>
        </div>

        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="size-5 text-emerald-700" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  {application.organisationName}
                </CardTitle>
                <CardDescription className="text-emerald-700">
                  Your club is registered and ready to go
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">
                Go to Dashboard
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Rejected — allow re-registration
  const isRejected = application?.status === 'rejected';

  return (
    <div className="mx-auto max-w-lg space-y-8 pb-16 md:pb-0">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Register Your Club
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Tell us about your club and you&apos;ll be ready to create shows
          straight away.
        </p>
      </div>

      {isRejected && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
                <XCircle className="size-5 text-red-700" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Previous Registration Not Approved
                </CardTitle>
                <CardDescription className="text-red-700">
                  {application.organisationName}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          {application.reviewNotes && (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <strong>Feedback:</strong> {application.reviewNotes}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <ClipboardCheck className="size-5 text-primary" />
            {isRejected ? 'Try Again' : 'Club Details'}
          </CardTitle>
          <CardDescription>
            Fill in your club details to get started. Fields marked with * are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClubApplicationForm
            defaultContactEmail={session?.user?.email ?? ''}
            onSuccess={() => utils.applications.myApplication.invalidate()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
