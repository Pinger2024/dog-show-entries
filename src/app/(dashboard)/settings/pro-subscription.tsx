'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  Crown,
  CheckCircle2,
  Sparkles,
  Trophy,
  Target,
  BarChart3,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const proFeatures = [
  {
    icon: Trophy,
    title: 'All Championship Routes',
    description:
      'Track both the Classic (3 CCs) and Alternative (2 CCs + 5 RCCs) routes to Champion',
  },
  {
    icon: Target,
    title: 'ShCEx & Veteran Warrant',
    description:
      'Monitor progress toward Show Certificate of Excellence and Veteran Warrant titles',
  },
  {
    icon: BarChart3,
    title: 'Detailed Breakdowns',
    description:
      'Unique judge counts, point breakdowns for JW, and actionable progress insights',
  },
];

export function ProSubscription() {
  const searchParams = useSearchParams();
  const showSuccess = searchParams.get('pro') === 'success';

  const { data: sub, isLoading } = trpc.pro.getSubscription.useQuery();
  const createCheckout = trpc.pro.createCheckout.useMutation();
  const createPortal = trpc.pro.createPortalSession.useMutation();
  const [selectedInterval, setSelectedInterval] = useState<
    'monthly' | 'annual'
  >('annual');

  const isActive = sub?.status === 'active' || sub?.status === 'trial';

  async function handleSubscribe() {
    const result = await createCheckout.mutateAsync({
      interval: selectedInterval,
    });
    window.location.href = result.url;
  }

  async function handleManageBilling() {
    const result = await createPortal.mutateAsync();
    window.location.href = result.url;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Active subscription view
  if (isActive) {
    return (
      <Card className="border-amber-200 dark:border-amber-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="size-5 text-amber-500" />
              Remi Pro
              <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-xs">
                Active
              </Badge>
            </CardTitle>
          </div>
          <CardDescription>
            You have full access to all Pro features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="size-4 shrink-0" />
              Welcome to Remi Pro! Your subscription is now active.
            </div>
          )}

          {sub?.currentPeriodEnd && (
            <p className="text-sm text-muted-foreground">
              Next billing date:{' '}
              <span className="font-medium text-foreground">
                {format(new Date(sub.currentPeriodEnd), 'd MMMM yyyy')}
              </span>
            </p>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleManageBilling}
            disabled={createPortal.isPending}
          >
            {createPortal.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            <ExternalLink className="size-3.5" />
            Manage Billing
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Upsell view
  return (
    <Card className="overflow-hidden">
      {/* Pro header banner */}
      <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Crown className="size-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Remi Pro</h3>
            <p className="text-sm text-white/80">
              The serious exhibitor&apos;s toolkit
            </p>
          </div>
        </div>
      </div>

      <CardContent className="space-y-6 pt-6">
        {/* Features */}
        <div className="space-y-4">
          {proFeatures.map((feature) => (
            <div key={feature.title} className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
                <feature.icon className="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="text-xs text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing toggle */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setSelectedInterval('monthly')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedInterval === 'monthly'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setSelectedInterval('annual')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedInterval === 'annual'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Annual
              <span className="ml-1.5 text-xs text-emerald-600">Save 33%</span>
            </button>
          </div>

          <div className="mt-4 text-center">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold">
                £{selectedInterval === 'annual' ? '3.33' : '4.99'}
              </span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            {selectedInterval === 'annual' && (
              <p className="mt-1 text-xs text-muted-foreground">
                £39.99 billed annually
              </p>
            )}
          </div>
        </div>

        {/* Subscribe button */}
        <Button
          className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white hover:from-amber-600 hover:to-yellow-600"
          size="lg"
          onClick={handleSubscribe}
          disabled={createCheckout.isPending}
        >
          {createCheckout.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {createCheckout.isPending
            ? 'Redirecting to checkout...'
            : 'Get Remi Pro'}
        </Button>
      </CardContent>
    </Card>
  );
}
