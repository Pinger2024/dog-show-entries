'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Crown,
  Check,
  ArrowUpRight,
  Loader2,
  Shield,
  Zap,
  CalendarDays,
  Ticket,
  PoundSterling,
  ArrowRight,
} from 'lucide-react';

function formatCurrency(pence: number) {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  active: { label: 'Active', variant: 'default' },
  trial: { label: 'Trial', variant: 'outline' },
  past_due: { label: 'Past Due', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
  none: { label: 'No Plan', variant: 'secondary' },
};

const tierLabels: Record<string, string> = {
  diy: 'DIY',
  managed: 'Managed',
};

export default function BillingPage() {
  const searchParams = useSearchParams();
  const toastShown = useRef(false);

  // Show toast for Stripe redirect results
  useEffect(() => {
    if (toastShown.current) return;
    if (searchParams.get('success') === 'true') {
      toast.success('Subscription activated successfully! Welcome aboard.');
      toastShown.current = true;
    } else if (searchParams.get('cancelled') === 'true') {
      toast.info('Checkout was cancelled. No changes were made.');
      toastShown.current = true;
    }
  }, [searchParams]);

  // Get the user's organisations first
  const { data: dashboard, isLoading: dashboardLoading } =
    trpc.secretary.getDashboard.useQuery();

  const orgId = dashboard?.organisations?.[0]?.id;

  // Get subscription info for the first org
  const { data: subscription, isLoading: subLoading } =
    trpc.subscription.getMySubscription.useQuery(
      { organisationId: orgId! },
      { enabled: !!orgId }
    );

  // Get all plans for comparison
  const { data: allPlans } = trpc.subscription.getPlans.useQuery();

  // Checkout mutation
  const checkoutMutation = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => toast.error(err.message),
  });

  // Portal mutation
  const portalMutation = trpc.subscription.createPortalSession.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading = dashboardLoading || (!!orgId && subLoading);

  if (isLoading) {
    return (
      <div className="space-y-6 pb-16 md:pb-0">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className={i === 3 ? 'lg:col-span-2' : ''}>
              <CardHeader>
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // No organisations
  if (!orgId || !dashboard?.organisations?.length) {
    return (
      <div className="space-y-8 pb-16 md:pb-0">
        <div>
          <h1 className="font-serif text-lg font-bold tracking-tight sm:text-2xl lg:text-3xl">
            Billing &amp; Subscription
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Manage your club&apos;s subscription and billing details.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
              <CreditCard className="size-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No organisation found</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              You need to be a member of an organisation before you can manage billing.
              Contact an admin to get set up.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = subscription?.plan;
  const status = subscription?.subscriptionStatus ?? 'none';
  const statusInfo = statusConfig[status] ?? statusConfig.none;
  const hasActiveSub = status === 'active' || status === 'trial';
  const orgName = subscription?.organisationName ?? dashboard?.organisations?.[0]?.name ?? 'Your club';

  // Find the upgrade plan (if on DIY, show Managed; if no plan, show both)
  const currentTier = plan?.serviceTier;
  const upgradePlans = allPlans?.filter((p) => {
    if (!plan) return true; // Show all if no plan
    if (currentTier === 'diy') return p.serviceTier === 'managed' && p.clubType === plan.clubType;
    return false; // Already on managed
  });

  // Estimate charges for usage card
  const showCount = dashboard?.totalShows ?? 0;
  const entryCount = dashboard?.totalEntries ?? 0;
  const estimatedCharges = plan
    ? plan.annualFeePence + showCount * plan.perShowFeePence + entryCount * plan.perEntryFeePence
    : 0;

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      {/* Header */}
      <div>
        <h1 className="font-serif text-lg font-bold tracking-tight sm:text-2xl lg:text-3xl">
          Billing &amp; Subscription
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Manage the subscription and billing for {orgName}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Current Plan Card ──────────────────────────────── */}
        <Card className="lg:row-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-5 text-primary" />
                Current Plan
              </CardTitle>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <CardDescription>
              {plan
                ? `${orgName} is on the ${plan.name} plan`
                : `${orgName} does not have an active plan`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {plan ? (
              <>
                {/* Plan name and tier */}
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                    {currentTier === 'managed' ? (
                      <Crown className="size-6 text-primary" />
                    ) : (
                      <Zap className="size-6 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-serif text-xl font-bold">{plan.name}</p>
                    <Badge variant="outline" className="mt-0.5">
                      {tierLabels[plan.serviceTier] ?? plan.serviceTier}
                    </Badge>
                  </div>
                </div>

                {/* Pricing breakdown */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Pricing
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[0.9375rem]">
                      <span className="text-muted-foreground">Annual fee</span>
                      <span className="font-medium">
                        {formatCurrency(plan.annualFeePence)}/year
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[0.9375rem]">
                      <span className="text-muted-foreground">Per show</span>
                      <span className="font-medium">
                        {formatCurrency(plan.perShowFeePence)}/show
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[0.9375rem]">
                      <span className="text-muted-foreground">Per entry</span>
                      <span className="font-medium">
                        {formatCurrency(plan.perEntryFeePence)}/entry
                      </span>
                    </div>
                  </div>
                </div>

                {/* Current period */}
                {subscription?.subscriptionCurrentPeriodEnd && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" />
                    <span>
                      Current period ends{' '}
                      <span className="font-medium text-foreground">
                        {formatDate(subscription.subscriptionCurrentPeriodEnd)}
                      </span>
                    </span>
                  </div>
                )}

                {/* Features */}
                {plan.features && plan.features.length > 0 && (
                  <div className="border-t pt-4">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Included
                    </p>
                    <ul className="space-y-2">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 text-[0.9375rem]"
                        >
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="border-t pt-4">
                  {hasActiveSub && subscription?.stripeCustomerId && (
                    <Button
                      onClick={() =>
                        portalMutation.mutate({
                          organisationId: orgId,
                        })
                      }
                      disabled={portalMutation.isPending}
                      className="w-full"
                    >
                      {portalMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CreditCard className="size-4" />
                      )}
                      Manage Billing
                      <ArrowUpRight className="size-4" />
                    </Button>
                  )}

                  {status === 'past_due' && subscription?.stripeCustomerId && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-sm font-medium text-destructive">
                          Your payment is past due. Please update your payment method
                          to avoid service interruption.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          portalMutation.mutate({
                            organisationId: orgId,
                          })
                        }
                        disabled={portalMutation.isPending}
                        className="w-full"
                      >
                        {portalMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CreditCard className="size-4" />
                        )}
                        Update Payment Method
                      </Button>
                    </div>
                  )}

                  {status === 'cancelled' && (
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/pricing">
                        Choose a New Plan
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </>
            ) : (
              /* No plan state */
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
                  <CreditCard className="size-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">No active plan</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Choose a plan to start accepting entries online and managing
                  your shows with Remi.
                </p>
                <Button className="mt-6" asChild>
                  <Link href="/pricing">
                    Choose a Plan
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Usage Summary Card ─────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="size-5 text-primary" />
              Usage Summary
            </CardTitle>
            <CardDescription>
              Your club&apos;s usage{hasActiveSub ? ' this period' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <CalendarDays className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-2xl font-bold">{showCount}</p>
                <p className="text-sm text-muted-foreground">
                  {showCount === 1 ? 'Show' : 'Shows'} created
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <Ticket className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-2xl font-bold">{entryCount}</p>
                <p className="text-sm text-muted-foreground">
                  {entryCount === 1 ? 'Entry' : 'Entries'} processed
                </p>
              </div>
            </div>

            {plan && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PoundSterling className="size-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Estimated charges
                    </span>
                  </div>
                  <span className="font-serif text-lg font-bold">
                    {formatCurrency(estimatedCharges)}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>
                    {formatCurrency(plan.annualFeePence)} annual +{' '}
                    {showCount} {showCount === 1 ? 'show' : 'shows'} x{' '}
                    {formatCurrency(plan.perShowFeePence)} +{' '}
                    {entryCount} {entryCount === 1 ? 'entry' : 'entries'} x{' '}
                    {formatCurrency(plan.perEntryFeePence)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Upgrade / Plan Comparison Card ────────────────── */}
        {plan && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="size-5 text-primary" />
                {currentTier === 'managed' ? 'Your Plan' : 'Upgrade'}
              </CardTitle>
              <CardDescription>
                {currentTier === 'managed'
                  ? "You're on our most comprehensive plan"
                  : 'Get more from Remi with a managed plan'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentTier === 'managed' ? (
                <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                    <Crown className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      You&apos;re on our best plan
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Enjoy full managed service with priority support.
                    </p>
                  </div>
                </div>
              ) : upgradePlans && upgradePlans.length > 0 ? (
                <div className="space-y-4">
                  {upgradePlans.map((upgradePlan) => (
                    <div
                      key={upgradePlan.id}
                      className="rounded-lg border border-primary/20 p-4 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-serif text-lg font-bold">
                              {upgradePlan.name}
                            </p>
                            <Badge className="border-gold/30 bg-gold/15 text-gold">
                              <Crown className="mr-0.5 size-3" />
                              Recommended
                            </Badge>
                          </div>
                          {upgradePlan.description && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {upgradePlan.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          {formatCurrency(upgradePlan.annualFeePence)}/year
                        </span>
                        <span>
                          {formatCurrency(upgradePlan.perShowFeePence)}/show
                        </span>
                        <span>
                          {formatCurrency(upgradePlan.perEntryFeePence)}/entry
                        </span>
                      </div>

                      {upgradePlan.features && upgradePlan.features.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {upgradePlan.features.map((feature) => (
                            <li
                              key={feature}
                              className="flex items-start gap-2 text-sm"
                            >
                              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-4">
                        {upgradePlan.stripePriceId ? (
                          <Button
                            onClick={() =>
                              checkoutMutation.mutate({
                                planId: upgradePlan.id,
                                organisationId: orgId,
                              })
                            }
                            disabled={checkoutMutation.isPending}
                            className="w-full"
                          >
                            {checkoutMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Zap className="size-4" />
                            )}
                            Upgrade to {tierLabels[upgradePlan.serviceTier] ?? upgradePlan.serviceTier}
                          </Button>
                        ) : (
                          <Button disabled className="w-full" variant="outline">
                            Coming Soon
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No upgrade options available at this time.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── No plan: show all available plans ─────────────── */}
        {!plan && allPlans && allPlans.length > 0 && (
          <Card className="lg:row-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-5 text-primary" />
                Available Plans
              </CardTitle>
              <CardDescription>
                Choose a plan to get started with Remi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {allPlans.map((availablePlan) => (
                <div
                  key={availablePlan.id}
                  className="rounded-lg border p-4 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-serif text-lg font-bold">
                          {availablePlan.name}
                        </p>
                        <Badge variant="outline">
                          {tierLabels[availablePlan.serviceTier] ?? availablePlan.serviceTier}
                        </Badge>
                      </div>
                      {availablePlan.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {availablePlan.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2">
                    <span className="font-serif text-2xl font-bold">
                      {formatCurrency(availablePlan.annualFeePence)}
                    </span>
                    <span className="text-sm text-muted-foreground">/year</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      + {formatCurrency(availablePlan.perShowFeePence)}/show
                    </span>
                    <span>
                      + {formatCurrency(availablePlan.perEntryFeePence)}/entry
                    </span>
                  </div>

                  {availablePlan.features && availablePlan.features.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {availablePlan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4">
                    {availablePlan.stripePriceId ? (
                      <Button
                        onClick={() =>
                          checkoutMutation.mutate({
                            planId: availablePlan.id,
                            organisationId: orgId,
                          })
                        }
                        disabled={checkoutMutation.isPending}
                        className="w-full"
                        variant={
                          availablePlan.serviceTier === 'managed'
                            ? 'default'
                            : 'outline'
                        }
                      >
                        {checkoutMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : availablePlan.serviceTier === 'managed' ? (
                          <Crown className="size-4" />
                        ) : (
                          <Zap className="size-4" />
                        )}
                        Subscribe to {availablePlan.name}
                      </Button>
                    ) : (
                      <Button disabled className="w-full" variant="outline">
                        Coming Soon
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Trust footer */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="size-3.5" />
        <span>
          Payments processed securely by{' '}
          <span className="font-medium text-foreground">Stripe</span>. Remi
          never stores your card details.
        </span>
      </div>
    </div>
  );
}
