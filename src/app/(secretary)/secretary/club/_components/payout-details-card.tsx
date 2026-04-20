'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Banknote, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

/**
 * Where should we send your entry money? — the whole of "Remi-as-merchant-
 * of-record" for the secretary boils down to this tiny form. No Stripe
 * onboarding, no KYC, no CRN. Just three fields and a Save button.
 *
 * Deliberately not wrapped in its own edit/view mode — the form IS the
 * view. If details are already saved the inputs show the current values;
 * Save overwrites. That's the simplest mental model for someone who
 * doesn't want to hunt for an "Edit" button.
 */
export function PayoutDetailsCard({ organisationId }: { organisationId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.secretary.getPayoutDetails.useQuery({
    organisationId,
  });

  const [accountName, setAccountName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  // Hydrate inputs when the query resolves. We don't use `defaultValue` here
  // because the data arrives after mount.
  useEffect(() => {
    if (!data) return;
    setAccountName(data.accountName ?? '');
    setSortCode(data.sortCode ?? '');
    setAccountNumber(data.accountNumber ?? '');
  }, [data]);

  const mutation = trpc.secretary.updatePayoutDetails.useMutation({
    onSuccess: () => {
      utils.secretary.getPayoutDetails.invalidate({ organisationId });
      toast.success('Bank details saved.');
    },
    onError: (err) => toast.error(err.message),
  });

  const isAlreadySaved = !!(data?.accountName && data?.sortCode && data?.accountNumber);

  const handleSave = () => {
    mutation.mutate({
      organisationId,
      accountName: accountName.trim(),
      sortCode: sortCode.trim(),
      accountNumber: accountNumber.trim(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 font-serif text-base sm:text-lg">
            <Banknote className="size-5 text-primary" />
            Where we send your entry money
          </CardTitle>
          {isAlreadySaved && (
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
              <CheckCircle2 className="mr-1 size-3" />
              Saved
            </Badge>
          )}
        </div>
        <CardDescription className="pt-1">
          Exhibitor entry fees go to Remi first. After each show we BACS
          the full entry total on to your club — usually within a week of
          entries closing. Tell us which account to send it to.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="payout-account-name">Account name</Label>
              <Input
                id="payout-account-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. Clyde Valley German Shepherd Dog Club"
                className="min-h-[2.75rem]"
              />
              <p className="text-xs text-muted-foreground">
                The name on the bank account exactly as your bank has it.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payout-sort-code">Sort code</Label>
                <Input
                  id="payout-sort-code"
                  value={sortCode}
                  onChange={(e) => setSortCode(e.target.value)}
                  placeholder="10-88-00"
                  inputMode="numeric"
                  className="min-h-[2.75rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payout-account-number">Account number</Label>
                <Input
                  id="payout-account-number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="00012345"
                  inputMode="numeric"
                  maxLength={8}
                  className="min-h-[2.75rem]"
                />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-xs text-muted-foreground">
                  We only use these details to send your club money. They&apos;re
                  stored securely and never shared with exhibitors.
                </p>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={mutation.isPending || !accountName.trim() || !sortCode.trim() || !accountNumber.trim()}
              className="w-full sm:w-auto"
              size="lg"
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {isAlreadySaved ? 'Update bank details' : 'Save bank details'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
