'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, Clock, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';

const DISMISS_KEY = 'remi-secretary-cta-dismissed';

export function SecretaryCTA() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true');
  }, []);

  // Only show for exhibitors
  const { data: application } = trpc.applications.myApplication.useQuery(
    undefined,
    { enabled: userRole === 'exhibitor', staleTime: 5 * 60 * 1000 }
  );

  // Don't render for non-exhibitors or if dismissed
  if (userRole !== 'exhibitor') return null;
  if (dismissed && application?.status !== 'pending') return null;

  // Pending application — always show regardless of dismiss
  if (application?.status === 'pending') {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="p-3 sm:p-4 lg:p-6 pb-2 sm:pb-2">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-700" />
            <CardTitle className="text-sm sm:text-base font-semibold">
              Application Under Review
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 lg:px-6 lg:pb-6 pt-0">
          <CardDescription className="text-xs sm:text-sm">
            Your secretary application for {application.organisationName} is
            being reviewed. We&apos;ll email you when there&apos;s an update.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  // No application or rejected — show the CTA with dismiss
  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="p-3 sm:p-4 lg:p-6 pb-2 sm:pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <CardTitle className="text-sm sm:text-base font-semibold">
              Are you a show secretary?
            </CardTitle>
          </div>
          <button
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, 'true');
              setDismissed(true);
            }}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 lg:px-6 lg:pb-6 pt-0">
        <CardDescription className="text-xs sm:text-sm">
          If you run shows for a breed club or canine society, you can apply to
          manage your shows through Remi — including online entries, payments,
          catalogues, and schedules.
        </CardDescription>
        <Button
          size="sm"
          className="mt-3 h-9 text-xs sm:text-sm"
          asChild
        >
          <Link href="/apply">
            Apply Now
            <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
