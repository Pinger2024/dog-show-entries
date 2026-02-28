'use client';

import { use, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { StripeProvider } from '@/components/providers/stripe-provider';
import { PaymentForm } from '@/app/(shows)/shows/[id]/enter/payment-form';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function EditEntryPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id: showId, entryId } = use(params);
  const router = useRouter();

  const [selectedClassIds, setSelectedClassIds] = useState<string[] | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const { data: entry, isLoading: entryLoading } = trpc.entries.getById.useQuery(
    { id: entryId }
  );

  const breedId = entry?.dog?.breedId;
  const { data: showClasses, isLoading: classesLoading } =
    trpc.shows.getClasses.useQuery(
      { showId, breedId },
      { enabled: !!entry }
    );

  const updateEntry = trpc.entries.update.useMutation({
    onSuccess: (result) => {
      if (result.requiresPayment && result.clientSecret) {
        setClientSecret(result.clientSecret);
      } else {
        toast.success('Entry updated', {
          description:
            result.feeDiff < 0
              ? `A refund of ${formatFee(Math.abs(result.feeDiff))} has been processed.`
              : 'Your class selections have been updated.',
        });
        router.push(`/entries/${entryId}`);
      }
    },
    onError: (error) => {
      toast.error('Failed to update', { description: error.message });
    },
  });

  // Initialize selection from current entry
  const currentClassIds = useMemo(
    () => entry?.entryClasses.map((ec) => ec.showClassId) ?? [],
    [entry]
  );

  const effectiveSelection = selectedClassIds ?? currentClassIds;

  const groupedClasses = useMemo(() => {
    if (!showClasses) return { age: [], achievement: [], special: [] };
    return {
      age: showClasses.filter((sc) => sc.classDefinition.type === 'age'),
      achievement: showClasses.filter((sc) => sc.classDefinition.type === 'achievement'),
      special: showClasses.filter((sc) => sc.classDefinition.type === 'special'),
    };
  }, [showClasses]);

  const currentTotal = entry?.totalFee ?? 0;
  const newTotal = useMemo(() => {
    if (!showClasses) return 0;
    return showClasses
      .filter((sc) => effectiveSelection.includes(sc.id))
      .reduce((sum, sc) => sum + sc.entryFee, 0);
  }, [showClasses, effectiveSelection]);

  const feeDiff = newTotal - currentTotal;
  const hasChanges = selectedClassIds !== null &&
    (selectedClassIds.length !== currentClassIds.length ||
      selectedClassIds.some((id) => !currentClassIds.includes(id)));

  function toggleClass(classId: string) {
    const current = selectedClassIds ?? currentClassIds;
    setSelectedClassIds(
      current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId]
    );
  }

  function handleSubmit() {
    updateEntry.mutate({ id: entryId, classIds: effectiveSelection });
  }

  if (entryLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-muted-foreground">Entry not found.</p>
      </div>
    );
  }

  // If we have a client secret, show the additional payment form
  if (clientSecret) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-6 text-lg font-bold sm:text-2xl">Additional Payment Required</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pay {formatFee(feeDiff)}
            </CardTitle>
            <CardDescription>
              Your class changes require an additional payment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StripeProvider clientSecret={clientSecret}>
              <PaymentForm
                amount={feeDiff}
                onSuccess={() => {
                  toast.success('Entry updated and payment processed');
                  router.push(`/entries/${entryId}`);
                }}
                onBack={() => setClientSecret(null)}
              />
            </StripeProvider>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-3 py-6 pb-24 sm:px-4">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/entries/${entryId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to entry
        </Link>
        <h1 className="mt-2 text-lg font-bold sm:text-2xl">Edit Classes</h1>
        <p className="text-sm text-muted-foreground">
          {entry.show.name} &middot; {entry.dog?.registeredName ?? 'Junior Handler'}
        </p>
      </div>

      <div className="space-y-6">
        {/* Class selection */}
        {classesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {Object.entries(groupedClasses).map(([type, classes]) => {
              if (classes.length === 0) return null;
              const labels: Record<string, string> = {
                age: 'Age Classes',
                achievement: 'Achievement Classes',
                special: 'Special Classes',
              };
              return (
                <div key={type}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {labels[type] ?? type}
                  </h3>
                  <div className="space-y-2">
                    {classes.map((sc) => {
                      const isSelected = effectiveSelection.includes(sc.id);
                      const wasOriginal = currentClassIds.includes(sc.id);
                      return (
                        <label
                          key={sc.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all hover:bg-accent/50',
                            isSelected && 'border-primary bg-primary/5',
                            isSelected && !wasOriginal && 'ring-1 ring-green-500/30',
                            !isSelected && wasOriginal && 'ring-1 ring-red-500/30'
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleClass(sc.id)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {sc.classDefinition.name}
                              </span>
                              {isSelected && !wasOriginal && (
                                <Badge className="bg-green-100 text-green-700 text-[10px]">
                                  Adding
                                </Badge>
                              )}
                              {!isSelected && wasOriginal && (
                                <Badge className="bg-red-100 text-red-700 text-[10px]">
                                  Removing
                                </Badge>
                              )}
                            </div>
                            {sc.classDefinition.description && (
                              <p className="text-sm text-muted-foreground">
                                {sc.classDefinition.description}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-sm font-semibold">
                            {formatFee(sc.entryFee)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Fee diff summary */}
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current total</span>
              <span>{formatFee(currentTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">New total</span>
              <span>{formatFee(newTotal)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between font-bold">
              <span>Difference</span>
              <span
                className={cn(
                  feeDiff > 0 && 'text-orange-600',
                  feeDiff < 0 && 'text-green-600'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {feeDiff > 0 ? (
                    <ArrowUpRight className="size-4" />
                  ) : feeDiff < 0 ? (
                    <ArrowDownRight className="size-4" />
                  ) : (
                    <Minus className="size-4" />
                  )}
                  {feeDiff > 0 ? '+' : ''}
                  {formatFee(feeDiff)}
                </span>
              </span>
            </div>
            {feeDiff > 0 && (
              <p className="text-sm text-muted-foreground">
                An additional payment of {formatFee(feeDiff)} will be required.
              </p>
            )}
            {feeDiff < 0 && (
              <p className="text-sm text-muted-foreground">
                A refund of {formatFee(Math.abs(feeDiff))} will be processed.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/entries/${entryId}`}>Cancel</Link>
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={!hasChanges || effectiveSelection.length === 0 || updateEntry.isPending}
          >
            {updateEntry.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
