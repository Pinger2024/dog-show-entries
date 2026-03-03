'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';

export function SecretaryCTA() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;

  // Only show for exhibitors
  const { data: application } = trpc.applications.myApplication.useQuery(
    undefined,
    { enabled: userRole === 'exhibitor', staleTime: 5 * 60 * 1000 }
  );

  // Don't render for non-exhibitors
  if (userRole !== 'exhibitor') return null;

  // Pending application
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

  // No application or rejected — show the CTA
  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="p-3 sm:p-4 lg:p-6 pb-2 sm:pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle className="text-sm sm:text-base font-semibold">
            Interested in running shows?
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 lg:px-6 lg:pb-6 pt-0">
        <CardDescription className="text-xs sm:text-sm">
          Apply to become a show secretary and manage entries, catalogues, and
          payments for your club.
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
