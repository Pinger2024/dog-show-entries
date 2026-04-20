'use client';

import { useEffect, useRef, useState } from 'react';
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
  Banknote,
  CheckCircle2,
  ShieldCheck,
  Clock,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

/**
 * Payments — a.k.a. "getting paid for your entries". Four visual states,
 * each chosen by the status enum on the org. Designed for 60+ year old
 * secretaries who are rightly nervous about anything financial: lots of
 * reassurance, one primary action per state, no jargon.
 */
export default function PaymentsPage() {
  const searchParams = useSearchParams();
  const toastShown = useRef(false);

  const { data: dashboard, isLoading: dashboardLoading } =
    trpc.secretary.getDashboard.useQuery();

  const orgId = dashboard?.organisations?.[0]?.id;

  const utils = trpc.useUtils();

  const { data: status, isLoading: statusLoading } =
    trpc.stripeConnect.getStatus.useQuery(
      { organisationId: orgId! },
      { enabled: !!orgId }
    );

  const startMutation = trpc.stripeConnect.startOnboarding.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message),
  });

  const refreshMutation = trpc.stripeConnect.refreshStatus.useMutation({
    onSuccess: () => {
      if (orgId) utils.stripeConnect.getStatus.invalidate({ organisationId: orgId });
      toast.success('Status refreshed.');
    },
    onError: (err) => toast.error(err.message),
  });

  // Surface the outcome of the Stripe redirect. `connect=active` means the
  // account is ready, anything else means onboarding isn't finished yet.
  useEffect(() => {
    if (toastShown.current) return;
    const result = searchParams.get('connect');
    if (!result) return;
    toastShown.current = true;

    if (result === 'active') toast.success("Stripe is connected — you're ready to take entries.");
    else if (result === 'pending') toast.info('Onboarding started. Finish the steps when you have a moment.');
    else if (result === 'restricted') toast.warning("Stripe needs a bit more info before you're good to go.");
    else if (result === 'rejected') toast.error('Stripe declined this account. Please contact us.');
    else if (result === 'error') toast.error('Something went wrong connecting to Stripe. Please try again.');
  }, [searchParams]);

  const isLoading = dashboardLoading || (!!orgId && statusLoading);

  if (isLoading) {
    return (
      <div className="space-y-6 pb-16 md:pb-0">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="space-y-8 pb-16 md:pb-0">
        <Header />
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
              <Banknote className="size-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No club yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              You need to be a member of a club before you can set up payments.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const state = status?.status ?? 'not_started';

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <Header />

      {state === 'not_started' && (
        <NotStartedCard
          onStart={() => startMutation.mutate({ organisationId: orgId })}
          isStarting={startMutation.isPending}
        />
      )}

      {state === 'pending' && (
        <PendingCard
          onContinue={() => startMutation.mutate({ organisationId: orgId })}
          onRefresh={() => refreshMutation.mutate({ organisationId: orgId })}
          isContinuing={startMutation.isPending}
          isRefreshing={refreshMutation.isPending}
        />
      )}

      {state === 'restricted' && (
        <RestrictedCard
          onContinue={() => startMutation.mutate({ organisationId: orgId })}
          onRefresh={() => refreshMutation.mutate({ organisationId: orgId })}
          isContinuing={startMutation.isPending}
          isRefreshing={refreshMutation.isPending}
        />
      )}

      {state === 'active' && <ActiveCard />}

      {state === 'rejected' && <RejectedCard />}

      <HowItWorks />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div>
      <h1 className="font-serif text-lg font-bold tracking-tight sm:text-2xl lg:text-3xl">
        Getting paid
      </h1>
      <p className="mt-1 text-sm text-muted-foreground sm:text-base">
        Connect your club to Stripe so exhibitor entry fees land straight
        in your bank account.
      </p>
    </div>
  );
}

/* ── State: not started ─────────────────────────────────────
   Big reassuring intro. Explains the exchange — Stripe is who holds and
   moves the money, Remi is who runs the show. A bulleted preview of what
   Stripe will ask for so there are no surprises mid-flow. Single CTA. */
function NotStartedCard({
  onStart,
  isStarting,
}: {
  onStart: () => void;
  isStarting: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-gradient-to-br from-primary/5 to-transparent p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Banknote className="size-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-xl font-bold leading-tight sm:text-2xl">
              Let&apos;s get your club paid
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
              Exhibitors pay online for their entries. Stripe — a trusted
              payment company — holds that money safely and sends it straight
              to your club&apos;s bank account every few days. No cheques, no
              chasing.
            </p>
          </div>
        </div>
      </div>

      <CardContent className="space-y-6 p-6 sm:p-8">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            What Stripe will ask you for
          </p>
          <ul className="space-y-2.5">
            <ReadyItem>The club&apos;s name and address</ReadyItem>
            <ReadyItem>Your bank account details (sort code + account number)</ReadyItem>
            <ReadyItem>A few details about you as the person signing up</ReadyItem>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            It takes about 10 minutes and you can save and come back if you
            get stuck.
          </p>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm">
              <span className="font-semibold">Good to know:</span> Stripe is
              the same company Uber, Deliveroo and countless charities use.
              Your bank details never touch Remi&apos;s servers.
            </p>
          </div>
        </div>

        <Button
          onClick={onStart}
          disabled={isStarting}
          size="lg"
          className="w-full min-h-[3rem]"
        >
          {isStarting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Taking you to Stripe…
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" />
              Connect your club to Stripe
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── State: pending (started but not finished) ─────────────── */
function PendingCard({
  onContinue,
  onRefresh,
  isContinuing,
  isRefreshing,
}: {
  onContinue: () => void;
  onRefresh: () => void;
  isContinuing: boolean;
  isRefreshing: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <Clock className="mr-1 size-3" />
            Nearly there
          </Badge>
        </div>
        <CardTitle className="pt-2">Finish connecting to Stripe</CardTitle>
        <CardDescription>
          You&apos;ve started — we just need you to complete Stripe&apos;s forms
          before your club can accept entry payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={onContinue}
          disabled={isContinuing}
          size="lg"
          className="w-full min-h-[3rem]"
        >
          {isContinuing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Taking you back to Stripe…
            </>
          ) : (
            <>
              Continue onboarding
              <ArrowUpRight className="size-4" />
            </>
          )}
        </Button>

        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <p>
              Finished on Stripe but still seeing this message?
            </p>
            <Button
              variant="link"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-auto px-0 text-sm"
            >
              {isRefreshing ? 'Checking…' : 'Check with Stripe now'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── State: restricted (Stripe wants more info) ───────────── */
function RestrictedCard({
  onContinue,
  onRefresh,
  isContinuing,
  isRefreshing,
}: {
  onContinue: () => void;
  onRefresh: () => void;
  isContinuing: boolean;
  isRefreshing: boolean;
}) {
  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/10">
            <AlertCircle className="size-5 text-amber-600" />
          </div>
          <div>
            <CardTitle>Stripe needs a little more</CardTitle>
            <CardDescription className="mt-1">
              This is common and easy to fix — Stripe just needs to tick one
              or two more boxes before your account can accept payments.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">Common things Stripe asks for:</p>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li>• A photo of your passport or driving licence</li>
            <li>• Your club&apos;s address in the format Stripe expects</li>
            <li>• A bank statement showing the account you&apos;re paying into</li>
          </ul>
        </div>

        <Button
          onClick={onContinue}
          disabled={isContinuing}
          size="lg"
          className="w-full min-h-[3rem]"
        >
          {isContinuing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Taking you to Stripe…
            </>
          ) : (
            <>
              Finish up on Stripe
              <ArrowUpRight className="size-4" />
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="w-full"
        >
          {isRefreshing ? 'Checking…' : "I've finished — re-check my status"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── State: active (all good) ─────────────────────────────── */
function ActiveCard() {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-6 text-primary" />
          </div>
          <div>
            <CardTitle>Stripe is connected</CardTitle>
            <CardDescription className="mt-1">
              Your club can take entry payments. Money arrives in your bank
              account on Stripe&apos;s normal payout schedule — typically every
              couple of days.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button asChild variant="outline" size="lg" className="w-full min-h-[3rem]">
          <a
            href="https://dashboard.stripe.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Manage on Stripe
            <ArrowUpRight className="size-4" />
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          You&apos;ll log in with the email and password you set up during
          onboarding.
        </p>
      </CardContent>
    </Card>
  );
}

/* ── State: rejected (uncommon but important) ─────────────── */
function RejectedCard() {
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-5 text-destructive" />
          </div>
          <CardTitle>We can&apos;t connect this account</CardTitle>
        </div>
        <CardDescription className="pt-2">
          Stripe has declined this account and we can&apos;t take entry payments
          through it. This is rare — please get in touch and we&apos;ll sort it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" size="lg" className="w-full min-h-[3rem]">
          <a href="mailto:feedback@inbound.remishowmanager.co.uk">
            Email Remi for help
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Footer: general reassurance ──────────────────────────── */
function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How it works</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Exhibitors pay their entry fee plus a small £1 + 1% handling fee at
          checkout. The £1 + 1% covers what it costs Remi to run the booking
          system; the rest — the full entry fee — goes to your club.
        </p>
        <p>
          Stripe sends the money to your bank account on their usual schedule
          (typically every 2–7 days after the entry is paid). You can see
          every payment, payout, and statement by logging in at
          dashboard.stripe.com.
        </p>
        <p>
          If someone asks for a refund, it comes out of the money Stripe is
          holding for you — the same way a normal card refund works.
        </p>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── */

function ReadyItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[0.9375rem]">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}
