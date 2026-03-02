'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
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
  ShoppingCart,
  Plus,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import { differenceInMonths } from 'date-fns';
import { trpc } from '@/lib/trpc/client';
import { formatDogName } from '@/lib/utils';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { StripeProvider } from '@/components/providers/stripe-provider';
import { PaymentForm } from './payment-form';
import { cn } from '@/lib/utils';
import { useEntryCart, type WizardStep } from './use-entry-cart';

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'entry_type', label: 'Type', icon: PawPrint },
  { key: 'select_dog', label: 'Dog', icon: Dog },
  { key: 'select_classes', label: 'Classes', icon: ListChecks },
  { key: 'cart_review', label: 'Review', icon: ShoppingCart },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'confirmation', label: 'Confirmed', icon: PartyPopper },
];

function formatFee(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function EnterShowPage() {
  const params = useParams();
  const showId = params.id as string;

  const cart = useEntryCart();
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [isNfc, setIsNfc] = useState(false);
  const [healthDeclared, setHealthDeclared] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [catalogueRequested, setCatalogueRequested] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  // JH form state
  const [jhName, setJhName] = useState('');
  const [jhDob, setJhDob] = useState('');
  const [jhKcNumber, setJhKcNumber] = useState('');

  // Start first entry automatically
  useEffect(() => {
    if (cart.entries.length === 0 && cart.step === 'entry_type') {
      cart.startNewEntry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch data
  const { data: show, isLoading: showLoading } = trpc.shows.getById.useQuery(
    { id: showId }
  );

  const { data: dogs, isLoading: dogsLoading } = trpc.dogs.list.useQuery();

  const selectedDog = dogs?.find((d) => d.id === cart.activeEntry?.dogId);
  const selectedDogSex = selectedDog?.sex as 'dog' | 'bitch' | undefined;

  const breedIdForClasses =
    cart.activeEntry?.entryType === 'standard' ? selectedDog?.breedId : undefined;

  const { data: showClasses, isLoading: classesLoading } =
    trpc.shows.getClasses.useQuery(
      { showId, breedId: breedIdForClasses },
      { enabled: cart.step === 'select_classes' }
    );

  // Win summary for smart class recommendations — pass showId so suggestions
  // are filtered to classes actually in this show's schedule
  const { data: winSummary } = trpc.dogs.getWinSummary.useQuery(
    { dogId: cart.activeEntry?.dogId ?? '', showId },
    { enabled: !!cart.activeEntry?.dogId && cart.step === 'select_classes' }
  );

  // Profile completeness check
  const { data: profileCheck, refetch: refetchProfile } =
    trpc.entries.validateExhibitorForEntry.useQuery();
  const updateProfileMutation = trpc.users.updateProfile.useMutation({
    onSuccess: () => refetchProfile(),
  });
  const [profileName, setProfileName] = useState('');
  const [profileAddress, setProfileAddress] = useState('');

  const checkoutMutation = trpc.orders.checkout.useMutation();

  // Pre-populate class selection when editing
  useEffect(() => {
    if (cart.editingExisting && cart.activeEntry) {
      setSelectedClassIds(cart.activeEntry.classIds);
      setIsNfc(cart.activeEntry.isNfc);
    }
  }, [cart.editingExisting, cart.activeEntry]);

  // Group classes by type, filtering by the selected dog's sex
  const groupedClasses = useMemo(() => {
    if (!showClasses) return { age: [], achievement: [], special: [], junior_handler: [] };

    // Filter to only show classes matching the dog's sex (or unisex classes)
    const sexFiltered = selectedDogSex
      ? showClasses.filter((sc) => !sc.sex || sc.sex === selectedDogSex)
      : showClasses;

    const byCanonicalOrder = (a: (typeof sexFiltered)[0], b: (typeof sexFiltered)[0]) =>
      (a.classDefinition.sortOrder ?? 0) - (b.classDefinition.sortOrder ?? 0);

    return {
      age: sexFiltered.filter((sc) => sc.classDefinition.type === 'age').sort(byCanonicalOrder),
      achievement: sexFiltered.filter((sc) => sc.classDefinition.type === 'achievement').sort(byCanonicalOrder),
      special: sexFiltered.filter((sc) => sc.classDefinition.type === 'special').sort(byCanonicalOrder),
      junior_handler: sexFiltered.filter((sc) => sc.classDefinition.type === 'junior_handler').sort(byCanonicalOrder),
    };
  }, [showClasses, selectedDogSex]);

  // Filter classes by entry type
  const availableClasses = useMemo(() => {
    if (cart.activeEntry?.entryType === 'junior_handler') {
      return groupedClasses.junior_handler;
    }
    return [
      ...groupedClasses.age,
      ...groupedClasses.achievement,
      ...groupedClasses.special,
    ];
  }, [cart.activeEntry?.entryType, groupedClasses]);

  // Calculate total for current selection using show-level fee tiers
  const selectedTotal = useMemo(() => {
    if (!showClasses || !show) return 0;
    const count = selectedClassIds.length;
    if (count === 0) return 0;

    // Use show-level fee tiers if available, otherwise fall back to per-class fees
    const firstFee = show.firstEntryFee;
    const subFee = show.subsequentEntryFee;
    const nfcFeeAmount = show.nfcEntryFee;

    if (isNfc && nfcFeeAmount != null) {
      return nfcFeeAmount * count;
    }

    if (firstFee != null) {
      const subsequentRate = subFee ?? firstFee;
      return firstFee + subsequentRate * (count - 1);
    }

    // Fallback: per-class fees from showClasses
    return showClasses
      .filter((sc) => selectedClassIds.includes(sc.id))
      .reduce((sum, sc) => sum + sc.entryFee, 0);
  }, [showClasses, selectedClassIds, show, isNfc]);

  // Age eligibility
  function getAgeEligibility(minMonths: number | null, maxMonths: number | null) {
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

  function handleConfirmClasses() {
    // Build human-readable class names for cart review
    const names = (showClasses ?? [])
      .filter((sc) => selectedClassIds.includes(sc.id))
      .map((sc) => {
        const sex = sc.sex === 'dog' ? ' Dog' : sc.sex === 'bitch' ? ' Bitch' : '';
        return `${sc.classDefinition.name}${sex}`;
      });
    cart.setClasses(selectedClassIds, names, selectedTotal, isNfc);
    setSelectedClassIds([]);
    setIsNfc(false);
  }

  function handleAddAnother() {
    setSelectedClassIds([]);
    setIsNfc(false);
    cart.addAnotherDog();
  }

  function handleAddJuniorHandler() {
    setSelectedClassIds([]);
    setIsNfc(false);
    cart.addJuniorHandler();
  }

  async function handleProceedToPayment() {
    try {
      const result = await checkoutMutation.mutateAsync({
        showId,
        catalogueRequested,
        entries: cart.entries.map((e) => ({
          entryType: e.entryType,
          dogId: e.dogId,
          classIds: e.classIds,
          isNfc: e.isNfc,
          handlerName: e.handlerName,
          handlerDob: e.handlerDob,
          handlerKcNumber: e.handlerKcNumber,
        })),
      });
      setClientSecret(result.clientSecret);
      setOrderId(result.orderId);
      setPaymentAmount(result.totalAmount);
      cart.setStep('payment');
    } catch {
      // Error is handled by tRPC
    }
  }

  function handlePaymentSuccess() {
    cart.checkoutSuccess();
  }

  // Find step index for indicator (skip JH step from display)
  const displaySteps = STEPS.filter((s) => {
    if (s.key === 'select_dog' && cart.activeEntry?.entryType === 'junior_handler') return false;
    return true;
  });
  const stepIndex = displaySteps.findIndex((s) => s.key === cart.step);

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

  // Profile completeness gate
  if (profileCheck && !profileCheck.valid) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Complete Your Profile</CardTitle>
            <CardDescription>
              Your profile needs updating before you can enter a show.
              The Kennel Club requires exhibitor name and address on all entries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileCheck.issues.map((issue) => (
              <p key={issue} className="text-sm text-destructive">
                {issue}
              </p>
            ))}

            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  placeholder="Your full name"
                  value={profileName || profileCheck.user.name || ''}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="profile-address">Address</Label>
                <Input
                  id="profile-address"
                  placeholder="Your full address"
                  value={profileAddress || profileCheck.user.address || ''}
                  onChange={(e) => setProfileAddress(e.target.value)}
                />
              </div>
              <Button
                onClick={() => {
                  const updates: Record<string, string> = {};
                  if (profileName) updates.name = profileName;
                  if (profileAddress) updates.address = profileAddress;
                  if (Object.keys(updates).length > 0) {
                    updateProfileMutation.mutate(updates);
                  }
                }}
                disabled={updateProfileMutation.isPending || (!profileName && !profileAddress)}
              >
                {updateProfileMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Save & Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-3 py-6 pb-24 sm:px-4 sm:py-8 lg:px-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/shows/${showId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to show
        </Link>
        <h1 className="mt-2 text-lg font-bold sm:text-xl lg:text-2xl">Enter {show.name}</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {show.startDate} &middot; {show.venue?.name ?? 'Venue TBC'}
        </p>
      </div>

      {/* Step indicator */}
      <nav className="mb-6 sm:mb-8">
        <ol className="flex items-center justify-between gap-1 sm:justify-start sm:gap-2">
          {displaySteps.map((s, i) => {
            const isCurrent = s.key === cart.step || (s.key === 'select_dog' && cart.step === 'junior_handler');
            const isComplete = i < stepIndex;
            return (
              <li key={s.key} className="flex items-center gap-1 sm:gap-2">
                {i > 0 && (
                  <div
                    className={cn(
                      'h-px w-3 sm:w-8',
                      isComplete ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium transition-colors sm:px-3',
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

      {/* Cart badge */}
      {cart.entries.length > 0 && cart.step !== 'cart_review' && cart.step !== 'payment' && cart.step !== 'confirmation' && (
        <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <ShoppingCart className="size-4" />
            <span>
              {cart.entries.filter((e) => e.classIds.length > 0).length} entr
              {cart.entries.filter((e) => e.classIds.length > 0).length !== 1 ? 'ies' : 'y'} in cart
            </span>
            {cart.grandTotal > 0 && (
              <Badge variant="secondary">{formatFee(cart.grandTotal)}</Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cart.setStep('cart_review')}
            disabled={cart.entries.filter((e) => e.classIds.length > 0).length === 0}
          >
            View Cart
          </Button>
        </div>
      )}

      {/* Step: Entry Type */}
      {cart.step === 'entry_type' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold sm:text-lg">What type of entry?</h2>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <button
              type="button"
              onClick={() => cart.setEntryType('standard')}
              className="flex min-h-[44px] items-start gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/50 sm:p-4"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Dog className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium sm:text-base">Enter a Dog</p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Standard breed class entry for your registered dog.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => cart.setEntryType('junior_handler')}
              className="flex min-h-[44px] items-start gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/50 sm:p-4"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                <Users className="size-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium sm:text-base">Junior Handler</p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Handler aged 6-24, judged on handling skill.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Step: Select Dog */}
      {cart.step === 'select_dog' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold sm:text-lg">Which dog are you entering?</h2>

          {dogsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : dogs && dogs.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              {dogs.map((dog) => (
                <button
                  key={dog.id}
                  type="button"
                  onClick={() =>
                    cart.setDog(
                      dog.id,
                      formatDogName(dog),
                      dog.breed?.name ?? ''
                    )
                  }
                  className="flex min-h-[44px] items-start gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/50 sm:p-4"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Dog className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{formatDogName(dog)}</p>
                    <p className="text-sm text-muted-foreground">
                      {dog.breed?.name}
                    </p>
                    {dog.kcRegNumber && (
                      <p className="text-xs text-muted-foreground">
                        KC: {dog.kcRegNumber}
                      </p>
                    )}
                  </div>
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

          <div className="flex justify-start pt-4">
            <Button variant="outline" onClick={() => cart.setStep('entry_type')}>
              <ChevronLeft className="size-4" />
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Step: Junior Handler Details */}
      {cart.step === 'junior_handler' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Junior Handler Details</h2>
          <p className="text-sm text-muted-foreground">
            Enter the details of the young handler. They must be aged 6-24 years on the day of the show.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="jh-name">Handler Name</Label>
              <Input
                id="jh-name"
                value={jhName}
                onChange={(e) => setJhName(e.target.value)}
                placeholder="Full name of handler"
              />
            </div>
            <div>
              <Label htmlFor="jh-dob">Date of Birth</Label>
              <Input
                id="jh-dob"
                type="date"
                value={jhDob}
                onChange={(e) => setJhDob(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="jh-kc">KC Number (optional)</Label>
              <Input
                id="jh-kc"
                value={jhKcNumber}
                onChange={(e) => setJhKcNumber(e.target.value)}
                placeholder="If registered with the KC"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="h-11 flex-1 text-sm sm:flex-none" onClick={() => cart.setStep('entry_type')}>
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <Button
              className="h-11 flex-1 text-sm sm:flex-none"
              onClick={() => {
                cart.setJHDetails(jhName, jhDob, jhKcNumber || undefined);
                setJhName('');
                setJhDob('');
                setJhKcNumber('');
              }}
              disabled={!jhName || !jhDob}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Select Classes */}
      {cart.step === 'select_classes' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold sm:text-lg">Select classes</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {cart.activeEntry?.entryType === 'standard'
                ? `Choose classes for ${cart.activeEntry?.dogName ?? 'your dog'}`
                : `Choose classes for ${cart.activeEntry?.handlerName ?? 'the handler'}`}
            </p>
          </div>

          {classesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Render class groups */}
              {cart.activeEntry?.entryType === 'standard' ? (
                <>
                  {groupedClasses.age.length > 0 && (
                    <ClassGroup
                      title="Age Classes"
                      classes={groupedClasses.age}
                      selectedIds={selectedClassIds}
                      onToggle={toggleClass}
                      getAgeEligibility={getAgeEligibility}
                    />
                  )}
                  {groupedClasses.achievement.length > 0 && (
                    <>
                      {winSummary && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950">
                          <p className="font-medium text-blue-900 dark:text-blue-100">
                            {winSummary.recommendation.suggested
                              ? <>Suggested class: <span className="font-bold">{winSummary.recommendation.suggested}</span></>
                              : 'Eligible for all achievement classes'}
                          </p>
                          <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
                            {winSummary.recommendation.reason}
                          </p>
                        </div>
                      )}
                      <ClassGroup
                        title="Achievement Classes"
                        classes={groupedClasses.achievement}
                        selectedIds={selectedClassIds}
                        onToggle={toggleClass}
                        eligibleClassNames={winSummary?.recommendation.eligible}
                        suggestedClassName={winSummary?.recommendation.suggested}
                      />
                    </>
                  )}
                  {groupedClasses.special.length > 0 && (
                    <ClassGroup
                      title="Special Classes"
                      classes={groupedClasses.special}
                      selectedIds={selectedClassIds}
                      onToggle={toggleClass}
                    />
                  )}
                </>
              ) : (
                <>
                  {availableClasses.length > 0 ? (
                    <ClassGroup
                      title="Junior Handler Classes"
                      classes={availableClasses}
                      selectedIds={selectedClassIds}
                      onToggle={toggleClass}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No junior handler classes available for this show.
                    </p>
                  )}
                </>
              )}

              {/* NFC option */}
              {cart.activeEntry?.entryType === 'standard' && (
                <>
                  <Separator />
                  <label className="flex cursor-pointer items-center gap-3">
                    <Checkbox
                      checked={isNfc}
                      onCheckedChange={(checked) => setIsNfc(checked === true)}
                    />
                    <div>
                      <span className="font-medium">Not For Competition (NFC)</span>
                      <p className="text-sm text-muted-foreground">
                        Enter classes for experience only, not competing for awards.
                      </p>
                    </div>
                  </label>
                </>
              )}
            </>
          )}

          {/* Running total */}
          <div className="sticky bottom-0 rounded-lg border bg-background p-3 shadow-sm sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {selectedClassIds.length} class
                  {selectedClassIds.length !== 1 ? 'es' : ''} selected
                </p>
                <p className="text-base font-bold sm:text-lg">{formatFee(selectedTotal)}</p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  className="h-11 flex-1 text-sm sm:flex-none"
                  onClick={() => {
                    if (cart.editingExisting) {
                      cart.setStep('cart_review');
                    } else {
                      cart.setStep(
                        cart.activeEntry?.entryType === 'standard'
                          ? 'select_dog'
                          : 'junior_handler'
                      );
                    }
                  }}
                >
                  <ChevronLeft className="size-4" />
                  Back
                </Button>
                <Button
                  className="h-11 flex-1 text-sm sm:flex-none"
                  onClick={handleConfirmClasses}
                  disabled={selectedClassIds.length === 0}
                >
                  {cart.editingExisting ? 'Update' : 'Add to Cart'}
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step: Cart Review */}
      {cart.step === 'cart_review' && (
        <div className="space-y-6">
          <h2 className="text-base font-semibold sm:text-lg">Review your entries</h2>

          {/* Show info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Show</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{show.name}</p>
              <p className="text-muted-foreground">
                {show.startDate} &middot; {show.venue?.name ?? 'TBC'}
              </p>
            </CardContent>
          </Card>

          {/* Cart entries */}
          {cart.entries
            .filter((e) => e.classIds.length > 0)
            .map((entry) => (
              <Card key={entry.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {entry.entryType === 'standard'
                          ? entry.dogName ?? 'Dog'
                          : `Junior Handler: ${entry.handlerName}`}
                      </CardTitle>
                      {entry.breedName && (
                        <CardDescription>{entry.breedName}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => cart.editEntry(entry.id)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => cart.removeEntry(entry.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {entry.classNames.length > 0 ? (
                    <ul className="space-y-0.5 text-muted-foreground">
                      {entry.classNames.map((name, i) => (
                        <li key={i}>{name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">
                      {entry.classIds.length} class
                      {entry.classIds.length !== 1 ? 'es' : ''}
                    </p>
                  )}
                  {entry.isNfc && (
                    <p className="text-xs font-semibold text-amber-600">NOT FOR COMPETITION</p>
                  )}
                  <p className="font-semibold">{formatFee(entry.totalFee)}</p>
                </CardContent>
              </Card>
            ))}

          {/* Add another */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={handleAddAnother}>
              <Plus className="size-4" />
              Add Another Dog
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleAddJuniorHandler}>
              <Users className="size-4" />
              Add Junior Handler
            </Button>
          </div>

          {/* Grand total */}
          <div className="rounded-lg border bg-muted/50 p-3 sm:p-4">
            <div className="flex justify-between text-sm font-bold sm:text-base">
              <span>Grand Total</span>
              <span>{formatFee(cart.grandTotal)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {cart.entries.filter((e) => e.classIds.length > 0).length} entr
              {cart.entries.filter((e) => e.classIds.length > 0).length !== 1 ? 'ies' : 'y'}
            </p>
          </div>

          {/* Printed catalogue */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <Checkbox
              checked={catalogueRequested}
              onCheckedChange={(checked) => setCatalogueRequested(checked === true)}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium">Request a printed catalogue</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tick this box if you would like to receive a printed show catalogue on the day.
              </p>
            </div>
          </label>

          {/* Declarations */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Declarations</h3>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={healthDeclared}
                onCheckedChange={(checked) => setHealthDeclared(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I declare that to the best of my knowledge my dog(s) are not
                suffering from any infectious or contagious disease, and have not
                been exposed to such disease during the 21 days prior to the show.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I agree to abide by the Kennel Club Rules and Regulations.
              </span>
            </label>
          </div>

          {checkoutMutation.error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {checkoutMutation.error.message}
            </div>
          )}

          <Button
            className="h-11 w-full text-sm sm:text-base"
            size="lg"
            onClick={handleProceedToPayment}
            disabled={
              !healthDeclared ||
              !termsAccepted ||
              checkoutMutation.isPending ||
              cart.entries.filter((e) => e.classIds.length > 0).length === 0
            }
          >
            {checkoutMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Proceed to Payment &middot; {formatFee(cart.grandTotal)}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Step: Payment */}
      {cart.step === 'payment' && clientSecret && (
        <div className="space-y-6">
          <h2 className="text-base font-semibold sm:text-lg">Payment</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pay {formatFee(paymentAmount)}
              </CardTitle>
              <CardDescription>Secure payment powered by Stripe</CardDescription>
            </CardHeader>
            <CardContent>
              <StripeProvider clientSecret={clientSecret}>
                <PaymentForm
                  amount={paymentAmount}
                  onSuccess={handlePaymentSuccess}
                  onBack={() => {
                    cart.setStep('cart_review');
                    setClientSecret(null);
                  }}
                />
              </StripeProvider>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Confirmation */}
      {cart.step === 'confirmation' && (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 sm:size-16">
            <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">
              {cart.entries.length === 1 ? 'Entry' : 'Entries'} Confirmed!
            </h2>
            <p className="mt-2 text-muted-foreground">
              Your {cart.entries.length === 1 ? 'entry' : `${cart.entries.length} entries`} for{' '}
              {show.name} {cart.entries.length === 1 ? 'has' : 'have'} been submitted.
            </p>
          </div>

          <Card>
            <CardContent className="space-y-3 py-4">
              {orderId && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Order Reference</span>
                  <span className="font-mono font-medium">
                    {orderId.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Entries</span>
                <span>{cart.entries.filter((e) => e.classIds.length > 0).length}</span>
              </div>
              {cart.entries
                .filter((e) => e.classIds.length > 0)
                .map((entry) => (
                  <div key={entry.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {entry.entryType === 'standard'
                        ? entry.dogName
                        : `JH: ${entry.handlerName}`}
                    </span>
                    <span>{entry.classIds.length} classes</span>
                  </div>
                ))}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Paid</span>
                <span>{formatFee(paymentAmount)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/entries">View My Entries</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                cart.reset();
                setHealthDeclared(false);
                setTermsAccepted(false);
                setClientSecret(null);
                setOrderId(null);
                cart.startNewEntry();
              }}
            >
              Enter More Dogs
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable ClassGroup component ──────────────────────────────

interface ShowClassItem {
  id: string;
  entryFee: number;
  sex: 'dog' | 'bitch' | null;
  classDefinition: {
    name: string;
    type: string;
    sortOrder: number;
    description: string | null;
    minAgeMonths: number | null;
    maxAgeMonths: number | null;
  };
}

function ClassGroup({
  title,
  classes,
  selectedIds,
  onToggle,
  getAgeEligibility,
  eligibleClassNames,
  suggestedClassName,
}: {
  title: string;
  classes: ShowClassItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  getAgeEligibility?: (
    min: number | null,
    max: number | null
  ) => { ageMonths: number; eligible: boolean } | null;
  eligibleClassNames?: string[];
  suggestedClassName?: string | null;
}) {
  // Filter out age-ineligible classes if eligibility info is available
  const visibleClasses = getAgeEligibility
    ? classes.filter((sc) => {
        if (sc.classDefinition.type !== 'age') return true;
        const elig = getAgeEligibility(
          sc.classDefinition.minAgeMonths,
          sc.classDefinition.maxAgeMonths
        );
        return !elig || elig.eligible;
      })
    : classes;

  if (visibleClasses.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-2">
        {visibleClasses.map((sc) => {
          const isSelected = selectedIds.includes(sc.id);
          const isSuggested = suggestedClassName === sc.classDefinition.name;
          const isIneligible = eligibleClassNames && !eligibleClassNames.includes(sc.classDefinition.name);
          return (
            <label
              key={sc.id}
              className={cn(
                'flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border p-3 transition-all hover:bg-accent/50 sm:gap-3',
                isSelected && 'border-primary bg-primary/5',
                isSuggested && !isSelected && 'border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/30',
                isIneligible && 'opacity-50',
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggle(sc.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="font-medium">
                    {sc.classDefinition.name}
                    {sc.sex && (
                      <span className="ml-1">
                        {sc.sex === 'dog' ? 'Dog' : 'Bitch'}
                      </span>
                    )}
                  </span>
                  {isSuggested && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0 dark:bg-blue-900 dark:text-blue-200">
                      Recommended
                    </Badge>
                  )}
                  {isIneligible && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      May not be eligible
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
}
