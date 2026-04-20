'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  CircleDashed,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react';

const STATUS_META: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    tone: 'default' | 'secondary' | 'destructive' | 'outline';
    colour: string;
  }
> = {
  active: { label: 'Active', icon: CheckCircle2, tone: 'default', colour: 'text-emerald-600' },
  pending: { label: 'Pending', icon: Clock, tone: 'outline', colour: 'text-amber-600' },
  restricted: { label: 'Restricted', icon: AlertCircle, tone: 'outline', colour: 'text-amber-700' },
  rejected: { label: 'Rejected', icon: XCircle, tone: 'destructive', colour: 'text-destructive' },
  not_started: { label: 'Not started', icon: CircleDashed, tone: 'secondary', colour: 'text-muted-foreground' },
};

/**
 * Admin dashboard view of every club's Stripe Connect state — read-only
 * triage for onboarding problems. Numbers come straight from our mirror
 * of Stripe's Account flags; the "Refresh from Stripe" button triggers
 * a direct fetch for any row that looks stale.
 */
export default function ConnectAccountsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.adminDashboard.listConnectAccounts.useQuery();

  const refreshMutation = trpc.adminDashboard.refreshConnectAccount.useMutation({
    onSuccess: (res) => {
      utils.adminDashboard.listConnectAccounts.invalidate();
      toast.success(`Synced — status now "${res.status}"`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const { rows = [], buckets = { active: 0, pending: 0, restricted: 0, rejected: 0, not_started: 0 }, total = 0 } = data ?? {};

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Admin
        </Link>
        <span>/</span>
        <span>Connect Accounts</span>
      </div>

      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Stripe Connect accounts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every club&apos;s onboarding state, mirrored from Stripe. Total: {total}.
        </p>
      </div>

      {/* Bucket summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(['active', 'pending', 'restricted', 'rejected', 'not_started'] as const).map((key) => {
          const meta = STATUS_META[key]!;
          const Icon = meta.icon;
          return (
            <Card key={key}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`size-5 shrink-0 ${meta.colour}`} />
                <div>
                  <p className="text-2xl font-bold">{buckets[key]}</p>
                  <p className="text-xs text-muted-foreground">{meta.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Account list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All clubs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No organisations yet.
              </p>
            ) : (
              rows.map((row) => {
                const meta = STATUS_META[row.stripeAccountStatus]!;
                const Icon = meta.icon;
                return (
                  <div key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className={`size-4 shrink-0 ${meta.colour}`} />
                        <p className="truncate font-medium">{row.name}</p>
                        <Badge variant={meta.tone} className="shrink-0 text-[11px]">
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {row.contactEmail && <span>{row.contactEmail}</span>}
                        {row.stripeAccountId && (
                          <span className="font-mono">{row.stripeAccountId}</span>
                        )}
                        <span>
                          Charges: {row.stripeChargesEnabled ? '✓' : '—'}
                        </span>
                        <span>
                          Payouts: {row.stripePayoutsEnabled ? '✓' : '—'}
                        </span>
                        <span>
                          Details: {row.stripeDetailsSubmitted ? '✓' : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {row.stripeAccountId && (
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={`https://dashboard.stripe.com/connect/accounts/${row.stripeAccountId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="size-3.5" />
                            Stripe
                          </a>
                        </Button>
                      )}
                      {row.stripeAccountId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            refreshMutation.mutate({ organisationId: row.id })
                          }
                          disabled={
                            refreshMutation.isPending &&
                            refreshMutation.variables?.organisationId === row.id
                          }
                        >
                          {refreshMutation.isPending &&
                          refreshMutation.variables?.organisationId === row.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                          Sync
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
