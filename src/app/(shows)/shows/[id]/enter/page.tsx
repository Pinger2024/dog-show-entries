'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Dog,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  CreditCard,
  Info,
  Loader2,
  Minus,
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
import { differenceInMonths, differenceInWeeks, format, parseISO } from 'date-fns';
import { isWithinAgeRange, handlerAgeYearsOnDate, formatCurrency } from '@/lib/date-utils';
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
import { isGsdOnlyClass, isGsdBreed } from '@/lib/class-templates';
import { useEntryCart, type WizardStep } from './use-entry-cart';

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'entry_type', label: 'Type', icon: PawPrint },
  { key: 'select_dog', label: 'Dog', icon: Dog },
  { key: 'select_classes', label: 'Classes', icon: ListChecks },
  { key: 'cart_review', label: 'Review', icon: ShoppingCart },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'confirmation', label: 'Confirmed', icon: PartyPopper },
];

const EMPTY_GROUPED_CLASSES = {
  age: [] as never[],
  achievement: [] as never[],
  special: [] as never[],
  junior_handler: [] as never[],
};

export default function EnterShowPage() {
  const params = useParams();
  const idOrSlug = params.id as string;

  const cart = useEntryCart(idOrSlug);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [isNfc, setIsNfc] = useState(false);
  const [healthDeclared, setHealthDeclared] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  // JH form state
  const [jhName, setJhName] = useState('');
  const [jhDob, setJhDob] = useState('');
  const [jhKcNumber, setJhKcNumber] = useState('');

  // Restore JH form state when navigating back to the JH step
  useEffect(() => {
    if (cart.step === 'junior_handler' && cart.activeEntry) {
      if (cart.activeEntry.handlerName && !jhName) setJhName(cart.activeEntry.handlerName);
      if (cart.activeEntry.handlerDob && !jhDob) setJhDob(cart.activeEntry.handlerDob);
      if (cart.activeEntry.handlerKcNumber && !jhKcNumber) setJhKcNumber(cart.activeEntry.handlerKcNumber);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.step]);

  // Start first entry automatically
  useEffect(() => {
    if (cart.entries.length === 0 && cart.step === 'entry_type') {
      cart.startNewEntry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch data
  const utils = trpc.useUtils();
  const { data: show, isLoading: showLoading } = trpc.shows.getById.useQuery(
    { id: idOrSlug }
  );
  // Resolved UUID for tRPC calls that require it
  const showId = show?.id ?? '';

  const { data: dogs, isLoading: dogsLoading } = trpc.dogs.list.useQuery();

  // Refetch dogs list when user returns to this tab (e.g. after adding a new dog in another tab)
  useEffect(() => {
    function handleFocus() { utils.dogs.list.invalidate(); }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [utils]);

  // For single-breed shows, determine the allowed breed(s) from show classes or judge assignments
  const showBreedIds = useMemo(() => {
    if (!show || show.showScope !== 'single_breed') return null;
    const ids = new Set<string>();
    // Collect breed IDs from show classes
    for (const sc of show.showClasses ?? []) {
      if (sc.breed?.id) ids.add(sc.breed.id);
    }
    // Also collect from judge assignments (some single-breed shows set breed there)
    for (const ja of show.judgeAssignments ?? []) {
      if (ja.breed?.id) ids.add(ja.breed.id);
    }
    return ids.size > 0 ? ids : null;
  }, [show]);

  // Filter dogs to only those eligible for this show's breed (single-breed shows)
  const eligibleDogs = useMemo(() => {
    if (!dogs) return undefined;
    if (!showBreedIds) return dogs; // group/general shows: all dogs eligible
    return dogs.filter((d) => showBreedIds.has(d.breedId));
  }, [dogs, showBreedIds]);

  const selectedDog = dogs?.find((d) => d.id === cart.activeEntry?.dogId);
  const selectedDogSex = selectedDog?.sex as 'dog' | 'bitch' | undefined;

  const breedIdForClasses =
    cart.activeEntry?.entryType === 'standard' ? selectedDog?.breedId : undefined;

  const { data: showClasses, isLoading: classesLoading } =
    trpc.shows.getClasses.useQuery(
      { showId, breedId: breedIdForClasses },
      { enabled: !!showId && cart.step === 'select_classes' }
    );

  // Check if show has JH classes (to conditionally show "Add Junior Handler" button)
  const { data: allShowClasses } = trpc.shows.getClasses.useQuery(
    { showId },
    { enabled: !!showId && (cart.step === 'entry_type' || cart.step === 'cart_review') }
  );
  const hasJhClasses = allShowClasses?.some(
    (sc) => sc.classDefinition.type === 'junior_handler'
  ) ?? false;

  const addDogsButtons = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button variant="outline" className="flex-1 min-h-[2.75rem]" onClick={handleAddAnother}>
        <Plus className="size-4" />
        Add Another Dog
      </Button>
      {hasJhClasses && (
        <Button variant="outline" className="flex-1 min-h-[2.75rem]" onClick={handleAddJuniorHandler}>
          <Users className="size-4" />
          Add Junior Handler
        </Button>
      )}
    </div>
  );

  // Pre-fetch sundry items from select_classes onwards so they're ready at cart_review
  const { data: sundryItemsData } = trpc.shows.getSundryItems.useQuery(
    { showId },
    { enabled: !!showId && (cart.step === 'select_classes' || cart.step === 'cart_review') }
  );

  // Sync cart sundry item prices/names with server data (handles secretary price changes)
  useEffect(() => {
    if (!sundryItemsData) return;
    for (const cartItem of cart.sundryItems) {
      const serverItem = sundryItemsData.find((s) => s.id === cartItem.sundryItemId);
      if (!serverItem) continue;
      if (
        serverItem.priceInPence !== cartItem.unitPrice ||
        serverItem.name !== cartItem.name ||
        serverItem.maxPerOrder !== cartItem.maxPerOrder
      ) {
        cart.setSundryItem({
          ...cartItem,
          unitPrice: serverItem.priceInPence,
          name: serverItem.name,
          maxPerOrder: serverItem.maxPerOrder,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sundryItemsData]);

  // Warn user before leaving the page if they have entries in the cart
  useEffect(() => {
    if (cart.entries.length === 0 || cart.step === 'confirmation') return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cart.entries.length, cart.step]);

  // Win summary for smart class recommendations — pass showId so suggestions
  // are filtered to classes actually in this show's schedule
  const { data: winSummary } = trpc.dogs.getWinSummary.useQuery(
    { dogId: cart.activeEntry?.dogId ?? '', showId },
    { enabled: !!showId && !!cart.activeEntry?.dogId && cart.step === 'select_classes' }
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
    if (!showClasses) return EMPTY_GROUPED_CLASSES;

    // Filter to only show classes matching the dog's sex (or unisex classes)
    const sexFiltered = selectedDogSex
      ? showClasses.filter((sc) => !sc.sex || sc.sex === selectedDogSex)
      : showClasses;

    // RKC rule: AVNSC classes are hidden when the show has breed-specific classes
    // for this breed. Check if any classes have the dog's breedId set.
    const hasBreedClasses = sexFiltered.some((sc) => sc.breedId != null);
    const isAvnsc = (name: string) =>
      /avnsc|not separately classified/i.test(name);

    // "Special Long Coat" classes only apply to German Shepherd Dogs
    const isGsd = isGsdBreed(selectedDog?.breed?.name ?? '');

    const eligible = (hasBreedClasses
      ? sexFiltered.filter((sc) => sc.breedId != null || !isAvnsc(sc.classDefinition.name))
      : sexFiltered
    ).filter((sc) => !isGsdOnlyClass(sc.classDefinition.name) || isGsd);

    const byCanonicalOrder = (a: (typeof eligible)[0], b: (typeof eligible)[0]) =>
      (a.classDefinition.sortOrder ?? 0) - (b.classDefinition.sortOrder ?? 0);

    return {
      age: eligible.filter((sc) => sc.classDefinition.type === 'age').sort(byCanonicalOrder),
      achievement: eligible.filter((sc) => sc.classDefinition.type === 'achievement').sort(byCanonicalOrder),
      special: eligible.filter((sc) => sc.classDefinition.type === 'special').sort(byCanonicalOrder),
      junior_handler: eligible.filter((sc) => sc.classDefinition.type === 'junior_handler').sort(byCanonicalOrder),
    };
  }, [showClasses, selectedDogSex, selectedDog?.breed?.name]);

  // Filter classes by entry type (and by handler age for JH entries)
  const availableClasses = useMemo(() => {
    if (cart.activeEntry?.entryType === 'junior_handler') {
      const handlerDob = cart.activeEntry?.handlerDob;
      if (!handlerDob) return groupedClasses.junior_handler;
      const handlerAgeMonths = differenceInMonths(
        show?.startDate ? new Date(show.startDate) : new Date(),
        new Date(handlerDob)
      );
      return groupedClasses.junior_handler.filter((sc) =>
        isWithinAgeRange(handlerAgeMonths, sc.classDefinition.minAgeMonths, sc.classDefinition.maxAgeMonths)
      );
    }
    return [
      ...groupedClasses.age,
      ...groupedClasses.achievement,
      ...groupedClasses.special,
    ];
  }, [cart.activeEntry?.entryType, cart.activeEntry?.handlerDob, groupedClasses, show?.startDate]);

  // Auto-select the single eligible JH class
  const jhAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (cart.step !== 'select_classes') {
      jhAutoSelectedRef.current = false;
      return;
    }
    if (
      cart.activeEntry?.entryType === 'junior_handler' &&
      !cart.editingExisting &&
      availableClasses.length === 1 &&
      selectedClassIds.length === 0 &&
      !jhAutoSelectedRef.current
    ) {
      jhAutoSelectedRef.current = true;
      setSelectedClassIds([availableClasses[0].id]);
    }
  }, [cart.step, cart.activeEntry?.entryType, cart.editingExisting, availableClasses, selectedClassIds.length]);

  // Calculate total for current selection using show-level fee tiers
  const selectedTotal = useMemo(() => {
    if (!showClasses || !show) return 0;
    const count = selectedClassIds.length;
    const nfcFeeAmount = show.nfcEntryFee;

    // NFC entries may have zero classes — charge flat NFC fee
    if (isNfc && nfcFeeAmount != null) {
      return count > 0 ? nfcFeeAmount * count : nfcFeeAmount;
    }

    if (count === 0) return 0;

    // Use show-level fee tiers if available, otherwise fall back to per-class fees
    const firstFee = show.firstEntryFee;
    const subFee = show.subsequentEntryFee;

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
        catalogueRequested: false,
        entries: cart.entries
          .filter((e) => e.classIds.length > 0 || e.isNfc)
          .map((e) => ({
            entryType: e.entryType,
            dogId: e.dogId,
            classIds: e.classIds,
            isNfc: e.isNfc,
            handlerName: e.handlerName,
            handlerDob: e.handlerDob,
            handlerKcNumber: e.handlerKcNumber,
          })),
        sundryItems: cart.sundryItems.map((s) => ({
          sundryItemId: s.sundryItemId,
          quantity: s.quantity,
        })),
      });

      // Free entries (£0) — skip payment, go straight to success
      if (result.totalAmount === 0 || !result.clientSecret) {
        setOrderId(result.orderId);
        cart.checkoutSuccess();
        return;
      }

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
              The Royal Kennel Club requires exhibitor name and address on all entries.
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
                  className="h-11"
                />
              </div>
              <div>
                <Label htmlFor="profile-address">Address</Label>
                <Input
                  id="profile-address"
                  placeholder="Your full address"
                  value={profileAddress || profileCheck.user.address || ''}
                  onChange={(e) => setProfileAddress(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button
                className="min-h-[2.75rem] w-full"
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
          href={`/shows/${idOrSlug}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to show
        </Link>
        <h1 className="mt-2 text-lg font-bold sm:text-xl lg:text-2xl">Enter {show.name}</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {format(parseISO(show.startDate), 'd MMMM yyyy')} &middot; {show.venue?.name ?? 'Venue TBC'}
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
              <Badge variant="secondary">{formatCurrency(cart.grandTotal)}</Badge>
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

            {hasJhClasses && (
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
                    Young handler entry — judged on handling skill, not the dog.
                  </p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step: Select Dog */}
      {cart.step === 'select_dog' && (() => {
        // Determine the show breed name for informational messages
        const showBreedName = show?.showScope === 'single_breed'
          ? (show.showClasses ?? []).find((sc) => sc.breed?.name)?.breed?.name
            ?? (show.judgeAssignments ?? []).find((ja) => ja.breed?.name)?.breed?.name
            ?? null
          : null;
        const filteredOutCount = dogs && eligibleDogs
          ? dogs.length - eligibleDogs.length
          : 0;

        return (
        <div className="space-y-4">
          <h2 className="text-base font-semibold sm:text-lg">Which dog are you entering?</h2>

          {/* Single breed show info banner */}
          {show?.showScope === 'single_breed' && showBreedName && (
            <div className="flex gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                This is a <span className="font-medium text-foreground">{showBreedName}</span> breed show.
                Only dogs of this breed can be entered.
                {filteredOutCount > 0 && (
                  <span className="block mt-1 text-xs">
                    {filteredOutCount} of your dog{filteredOutCount !== 1 ? 's are' : ' is'} a different breed and not shown below.
                  </span>
                )}
              </p>
            </div>
          )}

          {dogsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : eligibleDogs && eligibleDogs.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              {eligibleDogs.map((dog) => {
                const alreadyInCart = cart.entries.some(
                  (e) => e.dogId === dog.id && e.classIds.length > 0
                );

                // RKC age validation on show day
                const showDate = show?.startDate ? new Date(show.startDate) : null;
                const dob = dog.dateOfBirth ? new Date(dog.dateOfBirth) : null;
                const ageMonths = showDate && dob ? differenceInMonths(showDate, dob) : null;
                const ageWeeks = showDate && dob ? differenceInWeeks(showDate, dob) : null;
                const tooYoungForAll = ageWeeks !== null && ageWeeks < 12;
                const tooYoungForCompetition = ageMonths !== null && ageMonths < 6 && !tooYoungForAll;

                return (
                  <button
                    key={dog.id}
                    type="button"
                    onClick={() => {
                      if (tooYoungForAll) return; // Block entirely
                      cart.setDog(
                        dog.id,
                        formatDogName(dog),
                        dog.breed?.name ?? ''
                      );
                    }}
                    disabled={tooYoungForAll}
                    className={cn(
                      'flex min-h-[44px] items-start gap-3 rounded-xl border p-3 text-left transition-all sm:p-4',
                      tooYoungForAll && 'cursor-not-allowed opacity-50',
                      alreadyInCart
                        ? 'border-primary/30 bg-primary/5'
                        : !tooYoungForAll && 'hover:border-primary/50',
                      tooYoungForCompetition && 'border-amber-300 dark:border-amber-700'
                    )}
                  >
                    <div className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full',
                      tooYoungForAll
                        ? 'bg-destructive/10'
                        : tooYoungForCompetition
                          ? 'bg-amber-100 dark:bg-amber-900/30'
                          : 'bg-primary/10'
                    )}>
                      {tooYoungForAll ? (
                        <AlertTriangle className="size-5 text-destructive" />
                      ) : (
                        <Dog className={cn(
                          'size-5',
                          tooYoungForCompetition ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
                        )} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-medium">{formatDogName(dog)}</p>
                        {alreadyInCart && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            In cart
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {dog.breed?.name}
                      </p>
                      {dog.kcRegNumber && (
                        <p className="text-xs text-muted-foreground">
                          RKC: {dog.kcRegNumber}
                        </p>
                      )}
                      {ageMonths !== null && show?.startDate && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Age on show day: {ageMonths} months
                        </p>
                      )}
                      {tooYoungForAll && (
                        <p className="mt-1 text-xs font-medium text-destructive">
                          Too young to enter — must be at least 12 weeks old
                        </p>
                      )}
                      {tooYoungForCompetition && (
                        <div className="mt-1.5 flex gap-1.5 items-start">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-400" />
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Under 6 months — eligible for NFC (Not For Competition) only
                          </p>
                        </div>
                      )}
                      {show?.showType === 'limited' && (
                        <LimitedShowDogWarning dogId={dog.id} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : dogs && dogs.length > 0 && show?.showScope === 'single_breed' ? (
            // User has dogs but none match the show's breed
            <Card>
              <CardContent className="py-8 text-center">
                <AlertTriangle className="mx-auto mb-3 size-10 text-amber-500" />
                <p className="font-medium">No eligible dogs</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  This is a {showBreedName ?? 'single breed'} show. None of your registered dogs are this breed.
                </p>
                <Button asChild variant="outline">
                  <Link href="/dogs/new">Register a {showBreedName ?? 'new'} dog</Link>
                </Button>
              </CardContent>
            </Card>
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

          {eligibleDogs && eligibleDogs.length > 0 && (
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
        );
      })()}

      {/* Step: Junior Handler Details */}
      {cart.step === 'junior_handler' && (() => {
        const jhAgeMonths = jhDob && show?.startDate
          ? differenceInMonths(new Date(show.startDate), new Date(jhDob))
          : null;
        const jhAgeYears = jhDob && show?.startDate
          ? handlerAgeYearsOnDate(jhDob, show.startDate)
          : null;
        const jhTooYoung = jhAgeMonths !== null && jhAgeMonths < 72;
        const jhTooOld = jhAgeMonths !== null && jhAgeMonths >= 300;
        const jhHasMatchingClasses = jhAgeMonths !== null && !jhTooYoung && !jhTooOld
          ? (groupedClasses.junior_handler ?? []).some((sc) =>
              isWithinAgeRange(jhAgeMonths, sc.classDefinition.minAgeMonths, sc.classDefinition.maxAgeMonths)
            )
          : true;
        const jhAgeError = jhTooYoung
          ? 'Handler must be at least 6 years old on the day of the show.'
          : jhTooOld
            ? 'Handler must be under 25 years old on the day of the show.'
            : null;

        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Junior Handler Details</h2>

            <div className="flex gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Junior handling classes are judged on the handler&apos;s skill in presenting and moving their dog — not on the dog itself. Age is calculated on the first day of the show.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="jh-name">Handler Name</Label>
                <Input
                  id="jh-name"
                  value={jhName}
                  onChange={(e) => setJhName(e.target.value)}
                  placeholder="Full name of handler"
                  className="mt-1 h-11"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  The name of the person handling the dog in the ring.
                </p>
              </div>

              <div>
                <Label htmlFor="jh-dob">Date of Birth</Label>
                <Input
                  id="jh-dob"
                  type="date"
                  value={jhDob}
                  onChange={(e) => setJhDob(e.target.value)}
                  className="mt-1 h-11"
                />
                {jhAgeYears !== null && !jhAgeError && (
                  <Badge variant="secondary" className="mt-2">
                    Age on show day: {jhAgeYears} years
                  </Badge>
                )}
                {jhAgeError && (
                  <p className="mt-2 text-sm font-medium text-destructive">
                    {jhAgeError}
                  </p>
                )}
                {!jhAgeError && jhAgeMonths !== null && !jhHasMatchingClasses && (
                  <div className="mt-2 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-700 dark:bg-amber-950">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      No handling classes at this show match the handler&apos;s age.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="jh-kc">Membership Number</Label>
                <Input
                  id="jh-kc"
                  value={jhKcNumber}
                  onChange={(e) => setJhKcNumber(e.target.value)}
                  placeholder="YKC or JHA number"
                  className="mt-1 h-11"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  YKC or JHA membership number, if applicable.
                </p>
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
                disabled={!jhName || !jhDob || !!jhAgeError}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Step: Select Classes */}
      {cart.step === 'select_classes' && (() => {
        // Check if selected dog is under 6 months on show day
        const dogUnder6Months = (() => {
          if (cart.activeEntry?.entryType !== 'standard' || !selectedDog?.dateOfBirth || !show?.startDate) return false;
          const ageMonths = differenceInMonths(new Date(show.startDate), new Date(selectedDog.dateOfBirth));
          return ageMonths < 6;
        })();

        return (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold sm:text-lg">Select classes</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {cart.activeEntry?.entryType === 'standard'
                ? `Choose classes for ${cart.activeEntry?.dogName ?? 'your dog'}`
                : `Choose classes for ${cart.activeEntry?.handlerName ?? 'the handler'}`}
            </p>
          </div>

          {dogUnder6Months && (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">This dog is under 6 months old on show day</p>
                <p className="mt-0.5 text-xs">
                  Per RKC regulations, dogs must be at least 6 months old for competition classes.
                  You can still enter Not For Competition (NFC) — tick the NFC checkbox below.
                </p>
              </div>
            </div>
          )}

          {classesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Render class groups */}
              {cart.activeEntry?.entryType === 'standard' ? (
                <>
                  {winSummary && (groupedClasses.age.length > 0 || groupedClasses.achievement.length > 0) && (
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
                  {groupedClasses.age.length > 0 && (
                    <ClassGroup
                      title="Age Classes"
                      classes={groupedClasses.age}
                      selectedIds={selectedClassIds}
                      onToggle={toggleClass}
                      getAgeEligibility={getAgeEligibility}
                      suggestedClassName={winSummary?.recommendation.suggested}
                    />
                  )}
                  {groupedClasses.achievement.length > 0 && (
                    <ClassGroup
                      title="Achievement Classes"
                      classes={groupedClasses.achievement}
                      selectedIds={selectedClassIds}
                      onToggle={toggleClass}
                      eligibleClassNames={winSummary?.recommendation.eligible}
                      suggestedClassName={winSummary?.recommendation.suggested}
                    />
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
                  {availableClasses.length === 1 && selectedClassIds.length === 1 && (
                    <div className="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                      <p className="text-sm text-green-800 dark:text-green-200">
                        Based on the handler&apos;s age, they are eligible for{' '}
                        <span className="font-medium">{availableClasses[0].classDefinition.name}</span>.
                        This has been automatically selected.
                      </p>
                    </div>
                  )}
                  {availableClasses.length > 0 ? (
                    <ClassGroup
                      title="Junior Handler Classes"
                      classes={availableClasses}
                      selectedIds={selectedClassIds}
                      onToggle={toggleClass}
                    />
                  ) : (
                    <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        No handling classes match the handler&apos;s age. Go back and check the date of birth.
                      </p>
                    </div>
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
          <div className="sticky bottom-16 md:bottom-0 rounded-lg border bg-background p-3 shadow-sm sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {selectedClassIds.length} class
                  {selectedClassIds.length !== 1 ? 'es' : ''} selected
                </p>
                <p className="text-base font-bold sm:text-lg">{formatCurrency(selectedTotal)}</p>
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
                  disabled={
                    (selectedClassIds.length === 0 && !isNfc) ||
                    (dogUnder6Months && !isNfc)
                  }
                >
                  {cart.editingExisting ? 'Update' : 'Add to Cart'}
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

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
                {format(parseISO(show.startDate), 'd MMMM yyyy')} &middot; {show.venue?.name ?? 'TBC'}
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
                        className="size-11"
                        onClick={() => cart.editEntry(entry.id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 text-destructive"
                        onClick={() => cart.removeEntry(entry.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {entry.entryType === 'junior_handler' && entry.handlerDob && show?.startDate && (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        Age on show day: {handlerAgeYearsOnDate(entry.handlerDob, show.startDate)} years
                      </Badge>
                      {entry.handlerKcNumber && (
                        <Badge variant="outline">
                          Membership: {entry.handlerKcNumber}
                        </Badge>
                      )}
                    </div>
                  )}
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
                  <p className="font-semibold">{formatCurrency(entry.totalFee)}</p>
                </CardContent>
              </Card>
            ))}

          {/* Add another */}
          {addDogsButtons}

          {/* Sundry items (catalogues, memberships, donations, etc.) — shown BEFORE total */}
          {sundryItemsData && sundryItemsData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Add-ons</h3>
              <p className="text-xs text-muted-foreground">
                Optional extras available for this show — catalogues, memberships, and more.
              </p>
              {sundryItemsData.map((item) => {
                const inCart = cart.sundryItems.find((s) => s.sundryItemId === item.id);
                const isCheckbox = item.maxPerOrder === 1;

                if (isCheckbox) {
                  return (
                    <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                      <Checkbox
                        checked={!!inCart}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            cart.setSundryItem({
                              sundryItemId: item.id,
                              name: item.name,
                              quantity: 1,
                              unitPrice: item.priceInPence,
                              maxPerOrder: item.maxPerOrder,
                            });
                          } else {
                            cart.removeSundryItem(item.id);
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          {formatCurrency(item.priceInPence)}
                        </span>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        )}
                      </div>
                    </label>
                  );
                }

                // Quantity stepper for items with maxPerOrder > 1 or unlimited
                const qty = inCart?.quantity ?? 0;
                const max = item.maxPerOrder;

                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.priceInPence)} each
                        {max ? ` · max ${max}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-10"
                        disabled={qty === 0}
                        onClick={() => {
                          if (qty <= 1) {
                            cart.removeSundryItem(item.id);
                          } else {
                            cart.setSundryItem({
                              sundryItemId: item.id,
                              name: item.name,
                              quantity: qty - 1,
                              unitPrice: item.priceInPence,
                              maxPerOrder: item.maxPerOrder,
                            });
                          }
                        }}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{qty}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-10"
                        disabled={max != null && qty >= max}
                        onClick={() => {
                          cart.setSundryItem({
                            sundryItemId: item.id,
                            name: item.name,
                            quantity: qty + 1,
                            unitPrice: item.priceInPence,
                            maxPerOrder: item.maxPerOrder,
                          });
                        }}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Grand total with breakdown */}
          <div className="rounded-lg border bg-muted/50 p-3 sm:p-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {cart.entries.filter((e) => e.classIds.length > 0).length} entr
                  {cart.entries.filter((e) => e.classIds.length > 0).length !== 1 ? 'ies' : 'y'}
                </span>
                <span>{formatCurrency(cart.entriesTotal)}</span>
              </div>
              {cart.sundryTotal > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Add-ons</span>
                  <span>{formatCurrency(cart.sundryTotal)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1.5 text-sm font-bold sm:text-base">
                <span>Grand Total</span>
                <span>{formatCurrency(cart.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Second add-dog button — easier to find after scrolling through entries */}
          {cart.entries.length >= 2 && addDogsButtons}

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
                I declare that at the time of entries closing, to the best of my
                knowledge, my dog(s) are not suffering from any infectious or
                contagious disease. Should any such disease be identified within
                21 days of the show, my entry will be withdrawn.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I agree to abide by the{' '}
                <a
                  href="https://www.thekennelclub.org.uk/media/2876/f-regulations.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:no-underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Royal Kennel Club Rules and Regulations
                </a>.
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
                {cart.grandTotal === 0
                  ? 'Confirm Entry — Free'
                  : <>Proceed to Payment &middot; {formatCurrency(cart.grandTotal)}</>}
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
                Pay {formatCurrency(paymentAmount)}
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
                <span>{formatCurrency(paymentAmount)}</span>
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
  breedId: string | null;
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
                {formatCurrency(sc.entryFee)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Limited show eligibility warning ──────────────────────────
function LimitedShowDogWarning({ dogId }: { dogId: string }) {
  const { data } = trpc.dogs.checkLimitedShowEligibility.useQuery(
    { dogId },
    { enabled: !!dogId }
  );

  if (!data?.ineligible) return null;

  return (
    <div className="mt-1.5 flex gap-1.5 items-start">
      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-destructive" />
      <p className="text-xs font-medium text-destructive">
        {data.reason}
      </p>
    </div>
  );
}
