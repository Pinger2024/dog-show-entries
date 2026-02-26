'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Dog,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  CreditCard,
  Loader2,
  PawPrint,
  ListChecks,
  ClipboardCheck,
  PartyPopper,
} from 'lucide-react';
import { differenceInMonths } from 'date-fns';
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
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { StripeProvider } from '@/components/providers/stripe-provider';
import { PaymentForm } from './payment-form';
import { cn } from '@/lib/utils';

type Step = 'dog' | 'classes' | 'review' | 'payment' | 'confirmation';

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'dog', label: 'Select Dog', icon: PawPrint },
  { key: 'classes', label: 'Classes', icon: ListChecks },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'confirmation', label: 'Confirmed', icon: PartyPopper },
];

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function EnterShowPage() {
  const params = useParams();
  const router = useRouter();
  const showId = params.id as string;

  const [step, setStep] = useState<Step>('dog');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [isNfc, setIsNfc] = useState(false);
  const [healthDeclared, setHealthDeclared] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  // Fetch data
  const { data: show, isLoading: showLoading } = trpc.shows.getById.useQuery(
    { id: showId }
  );

  const { data: dogs, isLoading: dogsLoading } = trpc.dogs.list.useQuery();

  const selectedDog = dogs?.find((d) => d.id === selectedDogId);

  const { data: showClasses, isLoading: classesLoading } =
    trpc.shows.getClasses.useQuery(
      { showId, breedId: selectedDog?.breedId },
      { enabled: !!selectedDog }
    );

  const createPaymentIntent = trpc.payments.createIntent.useMutation();

  // Group classes by type
  const groupedClasses = useMemo(() => {
    if (!showClasses) return { age: [], achievement: [], special: [] };
    return {
      age: showClasses.filter((sc) => sc.classDefinition.type === 'age'),
      achievement: showClasses.filter(
        (sc) => sc.classDefinition.type === 'achievement'
      ),
      special: showClasses.filter(
        (sc) => sc.classDefinition.type === 'special'
      ),
    };
  }, [showClasses]);

  // Calculate total
  const selectedTotal = useMemo(() => {
    if (!showClasses) return 0;
    return showClasses
      .filter((sc) => selectedClassIds.includes(sc.id))
      .reduce((sum, sc) => sum + sc.entryFee, 0);
  }, [showClasses, selectedClassIds]);

  // Age eligibility helper
  function getAgeEligibility(
    minMonths: number | null,
    maxMonths: number | null
  ) {
    if (!selectedDog?.dateOfBirth) return null;
    const ageMonths = differenceInMonths(
      show?.startDate ? new Date(show.startDate) : new Date(),
      new Date(selectedDog.dateOfBirth)
    );
    const eligible =
      (minMonths === null || ageMonths >= minMonths) &&
      (maxMonths === null || ageMonths < maxMonths);
    return { ageMonths, eligible };
  }

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  }

  async function handleProceedToPayment() {
    try {
      const result = await createPaymentIntent.mutateAsync({
        showId,
        dogId: selectedDogId!,
        classIds: selectedClassIds,
        isNfc,
      });
      setClientSecret(result.clientSecret);
      setEntryId(result.entryId);
      setPaymentAmount(result.amount);
      setStep('payment');
    } catch {
      // Error is handled by tRPC's error state
    }
  }

  function handlePaymentSuccess() {
    setStep('confirmation');
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  if (showLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!show) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-muted-foreground">Show not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 pb-24 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/shows/${showId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to show
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Enter {show.name}</h1>
        <p className="text-sm text-muted-foreground">
          {show.startDate} &middot; {show.venue?.name ?? 'Venue TBC'}
        </p>
      </div>

      {/* Step indicator */}
      <nav className="mb-8">
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const isCurrent = s.key === step;
            const isComplete = i < stepIndex;
            return (
              <li key={s.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={cn(
                      'hidden h-px w-4 sm:block sm:w-8',
                      isComplete ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    isCurrent && 'bg-primary text-primary-foreground',
                    isComplete && 'bg-primary/10 text-primary',
                    !isCurrent && !isComplete && 'text-muted-foreground'
                  )}
                >
                  {isComplete ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <s.icon className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step 1: Select Dog */}
      {step === 'dog' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Which dog are you entering?</h2>

          {dogsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : dogs && dogs.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {dogs.map((dog) => (
                <button
                  key={dog.id}
                  type="button"
                  onClick={() => setSelectedDogId(dog.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:border-primary/50',
                    selectedDogId === dog.id &&
                      'border-primary bg-primary/5 ring-2 ring-primary/20'
                  )}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Dog className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{dog.registeredName}</p>
                    <p className="text-sm text-muted-foreground">
                      {dog.breed?.name}
                    </p>
                    {dog.kcRegNumber && (
                      <p className="text-xs text-muted-foreground">
                        KC: {dog.kcRegNumber}
                      </p>
                    )}
                  </div>
                  {selectedDogId === dog.id && (
                    <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Dog className="mx-auto mb-3 size-10 text-muted-foreground" />
                <p className="font-medium">No dogs registered yet</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  You need to add a dog before entering a show.
                </p>
                <Button asChild>
                  <Link href="/dogs/new">Add a Dog</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {dogs && dogs.length > 0 && (
            <Link
              href="/dogs/new"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              + Add a new dog
            </Link>
          )}

          <div className="flex justify-end pt-4">
            <Button
              onClick={() => setStep('classes')}
              disabled={!selectedDogId}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select Classes */}
      {step === 'classes' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Select classes</h2>
            <p className="text-sm text-muted-foreground">
              Choose the classes you&apos;d like to enter{' '}
              <span className="font-medium">{selectedDog?.registeredName}</span>{' '}
              in.
            </p>
          </div>

          {classesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Age-based classes */}
              {groupedClasses.age.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Age Classes
                  </h3>
                  <div className="space-y-2">
                    {groupedClasses.age.map((sc) => {
                      const eligibility = getAgeEligibility(
                        sc.classDefinition.minAgeMonths,
                        sc.classDefinition.maxAgeMonths
                      );
                      const isSelected = selectedClassIds.includes(sc.id);
                      return (
                        <label
                          key={sc.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all hover:bg-accent/50',
                            isSelected && 'border-primary bg-primary/5',
                            eligibility &&
                              !eligibility.eligible &&
                              'opacity-60'
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
                              {eligibility && !eligibility.eligible && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  Age may not match
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
              )}

              {/* Achievement-based classes */}
              {groupedClasses.achievement.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Achievement Classes
                  </h3>
                  <div className="space-y-2">
                    {groupedClasses.achievement.map((sc) => {
                      const isSelected = selectedClassIds.includes(sc.id);
                      return (
                        <label
                          key={sc.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all hover:bg-accent/50',
                            isSelected && 'border-primary bg-primary/5'
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleClass(sc.id)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">
                              {sc.classDefinition.name}
                            </span>
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
              )}

              {/* Special classes */}
              {groupedClasses.special.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Special Classes
                  </h3>
                  <div className="space-y-2">
                    {groupedClasses.special.map((sc) => {
                      const isSelected = selectedClassIds.includes(sc.id);
                      return (
                        <label
                          key={sc.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all hover:bg-accent/50',
                            isSelected && 'border-primary bg-primary/5'
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleClass(sc.id)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">
                              {sc.classDefinition.name}
                            </span>
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
              )}

              {/* NFC option */}
              <Separator />
              <label className="flex cursor-pointer items-center gap-3">
                <Checkbox
                  checked={isNfc}
                  onCheckedChange={(checked) =>
                    setIsNfc(checked === true)
                  }
                />
                <div>
                  <span className="font-medium">
                    Not For Competition (NFC)
                  </span>
                  <p className="text-sm text-muted-foreground">
                    Enter classes for experience only, not competing for
                    awards.
                  </p>
                </div>
              </label>
            </>
          )}

          {/* Running total */}
          <div className="sticky bottom-0 rounded-lg border bg-background p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {selectedClassIds.length} class
                  {selectedClassIds.length !== 1 ? 'es' : ''} selected
                </p>
                <p className="text-lg font-bold">{formatFee(selectedTotal)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('dog')}>
                  <ChevronLeft className="size-4" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep('review')}
                  disabled={selectedClassIds.length === 0}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Review & Confirm */}
      {step === 'review' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Review your entry</h2>

          {/* Show info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Show Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Show</span>
                <span className="font-medium">{show.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{show.startDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Venue</span>
                <span>{show.venue?.name ?? 'TBC'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Dog info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dog</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">
                  {selectedDog?.registeredName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Breed</span>
                <span>{selectedDog?.breed?.name}</span>
              </div>
              {selectedDog?.kcRegNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">KC Registration</span>
                  <span>{selectedDog.kcRegNumber}</span>
                </div>
              )}
              {isNfc && (
                <Badge variant="secondary" className="mt-1">
                  Not For Competition
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Classes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Classes Entered</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {showClasses
                ?.filter((sc) => selectedClassIds.includes(sc.id))
                .map((sc) => (
                  <div
                    key={sc.id}
                    className="flex justify-between text-sm"
                  >
                    <span>{sc.classDefinition.name}</span>
                    <span className="font-medium">
                      {formatFee(sc.entryFee)}
                    </span>
                  </div>
                ))}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatFee(selectedTotal)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Declarations */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Declarations</h3>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={healthDeclared}
                onCheckedChange={(checked) =>
                  setHealthDeclared(checked === true)
                }
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I declare that to the best of my knowledge my dog is not
                suffering from any infectious or contagious disease, and has not
                been exposed to such disease during the 21 days prior to the
                show.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={termsAccepted}
                onCheckedChange={(checked) =>
                  setTermsAccepted(checked === true)
                }
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I agree to abide by the Kennel Club Rules and Regulations.
              </span>
            </label>
          </div>

          {createPaymentIntent.error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {createPaymentIntent.error.message}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setStep('classes')}
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleProceedToPayment}
              disabled={
                !healthDeclared ||
                !termsAccepted ||
                createPaymentIntent.isPending
              }
            >
              {createPaymentIntent.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Proceed to Payment &middot; {formatFee(selectedTotal)}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Payment */}
      {step === 'payment' && clientSecret && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Payment</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pay {formatFee(paymentAmount)}
              </CardTitle>
              <CardDescription>
                Secure payment powered by Stripe
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StripeProvider clientSecret={clientSecret}>
                <PaymentForm
                  amount={paymentAmount}
                  onSuccess={handlePaymentSuccess}
                  onBack={() => {
                    setStep('review');
                    setClientSecret(null);
                  }}
                />
              </StripeProvider>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 5: Confirmation */}
      {step === 'confirmation' && (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Entry Confirmed!</h2>
            <p className="mt-2 text-muted-foreground">
              Your entry for {show.name} has been submitted successfully.
            </p>
          </div>

          {entryId && (
            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Entry Reference</span>
                  <span className="font-mono font-medium">
                    {entryId.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dog</span>
                  <span>{selectedDog?.registeredName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Classes</span>
                  <span>{selectedClassIds.length}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Paid</span>
                  <span>{formatFee(paymentAmount)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/entries">View My Entries</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/shows/${showId}/enter`} onClick={() => {
                setStep('dog');
                setSelectedDogId(null);
                setSelectedClassIds([]);
                setIsNfc(false);
                setHealthDeclared(false);
                setTermsAccepted(false);
                setClientSecret(null);
                setEntryId(null);
              }}>
                Enter Another Dog
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
