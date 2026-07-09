'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  AlertTriangle,
  Dog,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  CreditCard,
  Info,
  Loader2,
  Minus,
  PawPrint,
  ListChecks,
  ClipboardCheck,
  PartyPopper,
  Share2,
  ShoppingCart,
  Plus,
  Pencil,
  Trash2,
  Users,
  CalendarDays,
  CalendarPlus,
  Mail,
  MapPin,
  Ticket,
  Star,
  Lock,
} from 'lucide-react';
import { differenceInMonths, differenceInWeeks, format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { isWithinAgeRange, isAgeEligibleOnShowDay, handlerAgeYearsOnDate, formatCurrency } from '@/lib/date-utils';
import { trpc } from '@/lib/trpc/client';
import { formatDogName } from '@/lib/utils';
import { readReferralSource } from '@/lib/referral-source';
import { computeOrderFees, type DogEntryInput, type FeeContext } from '@/lib/fee-calc';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { StripeProvider, stripePromise } from '@/components/providers/stripe-provider';
import { PaymentForm } from './payment-form';
import { cn } from '@/lib/utils';
import { isGsdOnlyClass, isGsdBreed } from '@/lib/class-templates';
import { isCatalogueItem } from '@/lib/catalogue-utils';
import { useEntryCart, getPaymentKey, restoreActionForStatus, type WizardStep } from './use-entry-cart';
import { SecLabel, Chip, SEButton, SECard } from '@/components/show-experience/kit';

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'entry_type', label: 'Type', icon: PawPrint },
  { key: 'select_dog', label: 'Dog', icon: Dog },
  { key: 'select_classes', label: 'Classes', icon: ListChecks },
  { key: 'cart_review', label: 'Review', icon: ShoppingCart },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'confirmation', label: 'Confirmed', icon: PartyPopper },
];

// Local helper mirroring SEButton's class recipe for <Link>-as-button CTAs.
// SEButton itself renders a real <button> with no Slot/asChild support, so
// Link-wrapped actions compose the same classes directly instead.
const SE_LINK_BTN_BASE =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-2 whitespace-nowrap rounded-[13px] px-[18px] text-[14px] font-semibold transition-colors';
const SE_LINK_BTN_VARIANT = {
  fresh: 'bg-se-fresh text-[#0e2c19] shadow-[0_10px_24px_-12px_#5bb579]',
  ghost: 'bg-se-surface text-se-ink shadow-[inset_0_0_0_1px_#d7cfba]',
  onDark: 'bg-[rgba(243,236,220,0.14)] text-se-cream shadow-[inset_0_0_0_1px_rgba(243,236,220,0.25)]',
} as const;

const EMPTY_GROUPED_CLASSES = {
  age: [] as never[],
  achievement: [] as never[],
  special: [] as never[],
  junior_handler: [] as never[],
  sv_age: [] as never[],
};

// Everything the payment screen needs to render itself again after a reload
// (mobile Safari evicting a backgrounded tab mid-3DS). Persisted to localStorage
// under getPaymentKey when we enter the payment step; reusing the same
// PaymentIntent on restore means a card can never be charged twice.
interface PaymentSnapshot {
  clientSecret: string;
  orderId: string | null;
  paymentAmount: number;
  subtotalAmount: number;
  platformFeePence: number;
}

function loadPaymentSnapshot(showId: string): PaymentSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getPaymentKey(showId));
    return raw ? (JSON.parse(raw) as PaymentSnapshot) : null;
  } catch {
    return null;
  }
}

export default function EnterShowPage() {
  const params = useParams();
  const idOrSlug = params.id as string;

  const cart = useEntryCart(idOrSlug);
  const { data: session } = useSession();
  // Rehydrate the payment screen after a payment-step reload. loadSavedState
  // keeps step:'payment' when this snapshot exists, so seeding these from it
  // means the card form, amount and fee breakdown all come back intact and the
  // exhibitor carries straight on with the same PaymentIntent.
  const [initialPayment] = useState(() => loadPaymentSnapshot(idOrSlug));
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [isNfc, setIsNfc] = useState(false);
  const [healthDeclared, setHealthDeclared] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [withholdFromPublication, setWithholdFromPublication] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(initialPayment?.clientSecret ?? null);
  const [orderId, setOrderId] = useState<string | null>(initialPayment?.orderId ?? null);
  const [paymentAmount, setPaymentAmount] = useState(initialPayment?.paymentAmount ?? 0);
  // Subtotal and handling-fee breakdown — the club gets subtotalAmount,
  // Remi gets platformFeePence, exhibitor pays the sum (paymentAmount).
  const [subtotalAmount, setSubtotalAmount] = useState(initialPayment?.subtotalAmount ?? 0);
  const [platformFeePence, setPlatformFeePence] = useState(initialPayment?.platformFeePence ?? 0);
  const [shareCopied, setShareCopied] = useState(false);
  // Discount group declaration (e.g. "I am a Member") at checkout.
  // Stored as the group id or null. Sent to the server with the order
  // so the fee-calc service can apply the group's first-class rate
  // and (if set) member-specific multi-dog package price.
  const [discountGroupId, setDiscountGroupId] = useState<string | null>(null);

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

  // After a Stripe redirect (3-D Secure / bank auth) the return URL carries
  // payment_intent / redirect_status params. loadSavedState has already used
  // them to restore the cart at the confirmation (or review) step; strip them
  // from the URL now so a refresh doesn't re-run the redirect handling against
  // an already-cleared cart and bounce the user (Mandy 2026-06-17).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('payment_intent_client_secret') || params.has('redirect_status')) {
      for (const k of ['payment_intent', 'payment_intent_client_secret', 'redirect_status', 'source_type']) {
        params.delete(k);
      }
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  // Recover from a payment-step reload. If mobile Safari evicted the tab during
  // a 3-D Secure challenge, loadSavedState has already restored us — to the
  // payment screen (snapshot present) or cart review — instead of bouncing to
  // "add a dog". But the payment may actually have gone through in that lost
  // moment, so ask Stripe for the authoritative status of the saved
  // PaymentIntent: if it already succeeded (or is processing), jump straight to
  // confirmation. Otherwise leave them where they are to carry on / retry.
  useEffect(() => {
    if (cart.entries.length === 0) return;
    const snap = loadPaymentSnapshot(idOrSlug);
    if (!snap) return;
    let cancelled = false;
    stripePromise
      .then(async (stripe) => {
        if (!stripe || cancelled) return;
        const { paymentIntent } = await stripe.retrievePaymentIntent(snap.clientSecret);
        if (cancelled) return;
        // restoreActionForStatus encodes the succeeded/processing → confirmation,
        // canceled/dead → drop the stale snapshot & fall back to review, and
        // still-payable → stay decision (see use-entry-cart.ts; regression-
        // tested for the canceled-PI crash loop, April/BAGSD 2026-06-17).
        const action = restoreActionForStatus(paymentIntent?.status);
        if (action === 'confirmation') {
          try { localStorage.removeItem(getPaymentKey(idOrSlug)); } catch { /* private mode */ }
          cart.checkoutSuccess();
        } else if (action === 'review') {
          try { localStorage.removeItem(getPaymentKey(idOrSlug)); } catch { /* private mode */ }
          cart.setStep('cart_review');
        }
        // action === 'stay' → leave them on the restored payment screen.
      })
      .catch(() => { /* offline / Stripe unavailable — leave them as restored */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear the persisted payment snapshot whenever we reach confirmation, by any
  // path (normal success, Stripe redirect return, or the recovery effect above).
  useEffect(() => {
    if (cart.step === 'confirmation') {
      try { localStorage.removeItem(getPaymentKey(idOrSlug)); } catch { /* private mode */ }
    }
  }, [cart.step, idOrSlug]);

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

  // SV health profile — fetched only when we're on an SV show with a dog
  // selected, so we can client-side gate Yearling/Adult/Working entries
  // before the user gets all the way to checkout (Amanda 2026-05-21).
  const { data: selectedDogSvProfile } = trpc.dogs.getSvProfile.useQuery(
    { dogId: cart.activeEntry?.dogId ?? '' },
    { enabled: !!cart.activeEntry?.dogId && show?.showRuleset === 'wusv' },
  );
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

  // Auto-skip entry type step when there's only one option (standard)
  useEffect(() => {
    if (cart.step === 'entry_type' && allShowClasses && !hasJhClasses) {
      cart.setEntryType('standard');
    }
  }, [cart.step, allShowClasses, hasJhClasses]); // eslint-disable-line react-hooks/exhaustive-deps

  const addDogsButtons = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <SEButton variant="ghost" size="sm" className="flex-1" onClick={handleAddAnother}>
        <Plus className="size-4" />
        Add Another Dog
      </SEButton>
      {hasJhClasses && (
        <SEButton variant="ghost" size="sm" className="flex-1" onClick={handleAddJuniorHandler}>
          <Users className="size-4" />
          Add Junior Handler
        </SEButton>
      )}
    </div>
  );

  // Pre-fetch sundry items from select_classes onwards so they're ready at cart_review
  const { data: sundryItemsData } = trpc.shows.getSundryItems.useQuery(
    { showId },
    { enabled: !!showId && (cart.step === 'select_classes' || cart.step === 'cart_review') }
  );

  // Show's discount groups (Members, Pensioners, etc.) — exhibitor declares
  // one at checkout. Empty list = feature disabled for this show.
  const { data: discountGroups } = trpc.shows.getDiscountGroups.useQuery(
    { showId },
    { enabled: !!showId && cart.step === 'cart_review' }
  );

  // Live fee preview — mirrors server-side computation so the exhibitor sees
  // the right total before paying. The server recomputes authoritatively at
  // checkout, so this is purely informational; mismatch would be caught there.
  const feePreview = useMemo(() => {
    if (!show || show.firstEntryFee == null) return null;
    const selectedGroup = discountGroups?.find((g) => g.id === discountGroupId) ?? null;
    const feeCtx: FeeContext = {
      firstEntryFeePence: show.firstEntryFee,
      subsequentEntryFeePence: show.subsequentEntryFee,
      nfcEntryFeePence: show.nfcEntryFee,
      juniorHandlerFeePence: show.juniorHandlerFee,
      multiDogThreshold: show.multiDogThreshold ?? null,
      multiDogPackagePence: show.multiDogPackagePence ?? null,
      discountGroup: selectedGroup
        ? {
            firstEntryFeePence: selectedGroup.firstEntryFeePence,
            multiDogPackagePence: selectedGroup.multiDogPackagePence,
          }
        : null,
    };
    const dogEntries: DogEntryInput[] = cart.entries
      .filter((e) => e.classIds.length > 0 || e.isNfc)
      .map((e, i) => ({
        key: String(i),
        kind:
          e.entryType === 'junior_handler'
            ? 'junior_handler'
            : e.isNfc
              ? 'nfc'
              : 'standard',
        classCount: e.classIds.length,
      }));
    if (dogEntries.length === 0) return null;
    return computeOrderFees(dogEntries, feeCtx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, discountGroups, discountGroupId, cart.entries]);

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

    // WUSV shows: filter by dog's coat type when set (stock vs long_stock)
    const selectedDogCoatType = selectedDog?.coatType as 'stock' | 'long_stock' | null | undefined;
    const coatFiltered = selectedDogCoatType
      ? sexFiltered.filter((sc) => !(sc as { svCoatType?: string | null }).svCoatType || (sc as { svCoatType?: string | null }).svCoatType === selectedDogCoatType)
      : sexFiltered;

    // RKC rule: AVNSC classes are hidden when the show has breed-specific classes
    // for this breed. Check if any classes have the dog's breedId set.
    const hasBreedClasses = coatFiltered.some((sc) => sc.breedId != null);
    const isAvnsc = (name: string) =>
      /avnsc|not separately classified/i.test(name);

    // "Special Long Coat" classes only apply to German Shepherd Dogs
    const isGsd = isGsdBreed(selectedDog?.breed?.name ?? '');

    const eligible = (hasBreedClasses
      ? coatFiltered.filter((sc) => sc.breedId != null || !isAvnsc(sc.classDefinition.name))
      : coatFiltered
    ).filter((sc) => !isGsdOnlyClass(sc.classDefinition.name) || isGsd);

    const byCanonicalOrder = (a: (typeof eligible)[0], b: (typeof eligible)[0]) =>
      (a.classDefinition.sortOrder ?? 0) - (b.classDefinition.sortOrder ?? 0);

    return {
      age: eligible.filter((sc) => sc.classDefinition.type === 'age').sort(byCanonicalOrder),
      achievement: eligible.filter((sc) => sc.classDefinition.type === 'achievement').sort(byCanonicalOrder),
      special: eligible.filter((sc) => sc.classDefinition.type === 'special').sort(byCanonicalOrder),
      junior_handler: eligible.filter((sc) => sc.classDefinition.type === 'junior_handler').sort(byCanonicalOrder),
      sv_age: eligible.filter((sc) => sc.classDefinition.type === 'sv_age').sort(byCanonicalOrder),
    };
  }, [showClasses, selectedDogSex, selectedDog?.breed?.name, selectedDog?.coatType]);

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
      ...groupedClasses.sv_age,
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

  // Auto-select the single eligible SV age class for WUSV shows
  const wusvAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (cart.step !== 'select_classes') {
      wusvAutoSelectedRef.current = false;
      return;
    }
    if (
      show?.showRuleset === 'wusv' &&
      cart.activeEntry?.entryType === 'standard' &&
      !cart.editingExisting &&
      groupedClasses.sv_age.length === 1 &&
      selectedClassIds.length === 0 &&
      !wusvAutoSelectedRef.current
    ) {
      wusvAutoSelectedRef.current = true;
      setSelectedClassIds([(groupedClasses.sv_age[0] as { id: string }).id]);
    }
  }, [cart.step, cart.activeEntry?.entryType, cart.editingExisting, groupedClasses.sv_age, selectedClassIds.length, show?.showRuleset]);

  // Calculate total for current selection using show-level fee tiers
  const isJuniorHandler = cart.activeEntry?.entryType === 'junior_handler';
  const selectedTotal = useMemo(() => {
    if (!showClasses || !show) return 0;
    const count = selectedClassIds.length;
    const nfcFeeAmount = show.nfcEntryFee;

    // NFC entries may have zero classes — charge flat NFC fee
    if (isNfc && nfcFeeAmount != null) {
      return count > 0 ? nfcFeeAmount * count : nfcFeeAmount;
    }

    // Junior handler entries use a flat fee regardless of class count
    if (isJuniorHandler && show.juniorHandlerFee != null) {
      return count > 0 ? show.juniorHandlerFee : 0;
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
  }, [showClasses, selectedClassIds, show, isNfc, isJuniorHandler]);

  // Age eligibility — uses date-anchored bounds so a dog whose 1st
  // birthday IS the show day is still eligible for Puppy (Amanda
  // 2026-05-28). Integer month math floors and would wrongly exclude
  // the anniversary day or include the 27 days after it.
  function getAgeEligibility(minMonths: number | null, maxMonths: number | null) {
    if (!selectedDog?.dateOfBirth) return null;
    const showDay = show?.startDate ? new Date(show.startDate) : new Date();
    const dob = new Date(selectedDog.dateOfBirth);
    const ageMonths = differenceInMonths(showDay, dob);
    const eligible = isAgeEligibleOnShowDay(dob, showDay, minMonths, maxMonths);
    // When ineligible, work out which bound failed by re-running the same
    // date-anchored check with only one bound active — reuses
    // isAgeEligibleOnShowDay's exact math rather than re-deriving it here.
    const failedBound: 'min' | 'max' | null = eligible
      ? null
      : !isAgeEligibleOnShowDay(dob, showDay, minMonths, null)
        ? 'min'
        : 'max';
    return { ageMonths, eligible, failedBound };
  }

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) => {
      // WUSV / regional rule: one class per dog (Amanda 2026-05-26). Pick
      // semantics: clicking the selected class deselects it; clicking a
      // different class replaces the selection.
      if (show?.showRuleset === 'wusv') {
        return prev.includes(classId) ? [] : [classId];
      }
      return prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId];
    });
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

  // Shared by the select_classes "Back" button and the dog-summary-card
  // "Change" link — both should send the exhibitor to the same place.
  function handleBackFromSelectClasses() {
    if (cart.editingExisting) {
      cart.setStep('cart_review');
    } else {
      cart.setStep(
        cart.activeEntry?.entryType === 'standard' ? 'select_dog' : 'junior_handler'
      );
    }
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
      // Read the referral channel captured on the show page (if any) so the
      // resulting order row carries its provenance.
      const referralSource = readReferralSource(idOrSlug) ?? undefined;

      const result = await checkoutMutation.mutateAsync({
        showId,
        catalogueRequested: false,
        withholdFromPublication,
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
        referralSource,
        discountGroupId: discountGroupId ?? undefined,
      });

      // Free entries (£0) — skip payment, go straight to success
      if (result.totalAmount === 0 || !result.clientSecret) {
        setOrderId(result.orderId);
        cart.checkoutSuccess();
        return;
      }

      setClientSecret(result.clientSecret);
      setOrderId(result.orderId);
      // Paid branch of orders.checkout always returns totalAmount +
      // grossAmount + platformFeePence — the cast is because the full
      // union includes a free-entry variant without those fields, already
      // handled by the early return above.
      const paid = result as {
        totalAmount: number;
        platformFeePence: number;
        grossAmount: number;
      };
      setSubtotalAmount(paid.totalAmount);
      setPlatformFeePence(paid.platformFeePence);
      setPaymentAmount(paid.grossAmount);
      // Snapshot everything the payment screen shows, so a reload mid-3DS
      // restores the exact screen and reuses the SAME PaymentIntent (no second
      // charge) instead of bouncing the exhibitor (see loadPaymentSnapshot).
      try {
        localStorage.setItem(getPaymentKey(idOrSlug), JSON.stringify({
          clientSecret: result.clientSecret,
          orderId: result.orderId,
          paymentAmount: paid.grossAmount,
          subtotalAmount: paid.totalAmount,
          platformFeePence: paid.platformFeePence,
        } satisfies PaymentSnapshot));
      } catch { /* private mode */ }
      cart.setStep('payment');
    } catch {
      // Error is handled by tRPC
    }
  }

  function handlePaymentSuccess() {
    try { localStorage.removeItem(getPaymentKey(idOrSlug)); } catch { /* private mode */ }
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
    <div className="show-exp container mx-auto max-w-3xl px-3 py-6 pb-24 sm:px-4 sm:py-8 lg:px-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/shows/${idOrSlug}`}
          className="inline-flex items-center gap-1 text-sm text-se-ink3 hover:text-se-ink"
        >
          <ChevronLeft className="size-4" />
          Back to show
        </Link>
        <h1 className="mt-2 font-serif text-lg font-bold text-se-ink sm:text-xl lg:text-2xl">Enter {show.name}</h1>
        <p className="text-xs text-se-ink3 sm:text-sm">
          {format(parseISO(show.startDate), 'd MMMM yyyy')} &middot; {show.venue?.name ?? 'Venue TBC'}
        </p>
      </div>

      {/* Step indicator — slim segmented progress bar */}
      <nav className="mb-6 sm:mb-8" aria-label="Entry progress">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-se-ink2">
            {displaySteps[Math.max(stepIndex, 0)]?.label}
          </span>
          <span className="text-xs font-semibold text-se-ink3">
            Step {Math.max(stepIndex, 0) + 1} of {displaySteps.length}
          </span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {displaySteps.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i <= Math.max(stepIndex, 0) ? 'bg-se-fresh' : 'bg-se-line2'
              )}
            />
          ))}
        </div>
      </nav>

      {/* Cart badge */}
      {cart.entries.length > 0 && cart.step !== 'cart_review' && cart.step !== 'payment' && cart.step !== 'confirmation' && (
        <div className="mb-4 flex items-center justify-between rounded-[13px] border border-se-line bg-se-surface px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 text-xs text-se-ink2 sm:text-sm">
            <ShoppingCart className="size-4" />
            <span>
              {cart.entries.filter((e) => e.classIds.length > 0 || e.isNfc).length} entr
              {cart.entries.filter((e) => e.classIds.length > 0 || e.isNfc).length !== 1 ? 'ies' : 'y'} in cart
            </span>
            {cart.grandTotal > 0 && (
              <Chip tone="fresh">{formatCurrency(cart.grandTotal)}</Chip>
            )}
          </div>
          <button
            type="button"
            onClick={() => cart.setStep('cart_review')}
            disabled={cart.entries.filter((e) => e.classIds.length > 0 || e.isNfc).length === 0}
            className="text-xs font-semibold text-se-fresh-deep hover:underline disabled:opacity-40"
          >
            View Cart
          </button>
        </div>
      )}

      {/* Step: Entry Type */}
      {cart.step === 'entry_type' && (
        <div className="space-y-4">
          <h2 className="font-serif text-[22px] font-bold text-se-ink sm:text-[26px]">What type of entry?</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => cart.setEntryType('standard')}
              className="flex min-h-[44px] items-start gap-3 rounded-[18px] border border-se-line bg-se-surface p-4 text-left shadow-[0_1px_2px_rgba(27,36,29,0.04)] transition-colors hover:border-se-fresh-line"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-se-fresh-soft">
                <Dog className="size-5 text-se-fresh-deep" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-se-ink">Enter a Dog</p>
                <p className="text-[13px] text-se-ink3">
                  Standard breed class entry for your registered dog.
                </p>
              </div>
            </button>

            {hasJhClasses && (
              <button
                type="button"
                onClick={() => cart.setEntryType('junior_handler')}
                className="flex min-h-[44px] items-start gap-3 rounded-[18px] border border-se-line bg-se-surface p-4 text-left shadow-[0_1px_2px_rgba(27,36,29,0.04)] transition-colors hover:border-se-fresh-line"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-se-honey-soft">
                  <Users className="size-5 text-se-honey-deep" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-se-ink">Junior Handler</p>
                  <p className="text-[13px] text-se-ink3">
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
          <h2 className="font-serif text-[22px] font-bold text-se-ink sm:text-[26px]">Which dog are you entering?</h2>

          {/* Single breed show info banner */}
          {show?.showScope === 'single_breed' && showBreedName && (
            <div className="flex gap-3 rounded-[14px] border border-se-line bg-se-surface p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-se-fresh-deep" />
              <p className="text-sm text-se-ink2">
                This is a <span className="font-medium text-se-ink">{showBreedName}</span> breed show.
                Only dogs of this breed can be entered.
                {filteredOutCount > 0 && (
                  <span className="block mt-1 text-xs text-se-ink3">
                    {filteredOutCount} of your dog{filteredOutCount !== 1 ? 's are' : ' is'} a different breed and not shown below.
                  </span>
                )}
              </p>
            </div>
          )}

          {dogsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-se-ink3" />
            </div>
          ) : eligibleDogs && eligibleDogs.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      'flex min-h-[44px] items-start gap-3 rounded-[18px] border p-4 text-left shadow-[0_1px_2px_rgba(27,36,29,0.04)] transition-colors',
                      tooYoungForAll && 'cursor-not-allowed opacity-50',
                      alreadyInCart
                        ? 'border-se-fresh-line bg-se-fresh-soft'
                        : !tooYoungForAll && 'border-se-line bg-se-surface hover:border-se-fresh-line',
                      tooYoungForAll && 'border-se-line bg-se-surface',
                      tooYoungForCompetition && !alreadyInCart && 'border-se-honey bg-se-surface'
                    )}
                  >
                    <div className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full overflow-hidden',
                      tooYoungForAll
                        ? 'bg-destructive/10'
                        : tooYoungForCompetition
                          ? 'bg-se-honey-soft'
                          : 'bg-se-fresh-soft'
                    )}>
                      {tooYoungForAll ? (
                        <AlertTriangle className="size-5 text-destructive" />
                      ) : (dog as { primaryPhotoUrl?: string | null }).primaryPhotoUrl ? (
                        <img
                          src={(dog as { primaryPhotoUrl?: string | null }).primaryPhotoUrl!}
                          alt={formatDogName(dog)}
                          className="size-10 object-cover"
                        />
                      ) : (
                        <Dog className={cn(
                          'size-5',
                          tooYoungForCompetition ? 'text-se-honey-deep' : 'text-se-fresh-deep'
                        )} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-se-ink">{formatDogName(dog)}</p>
                        {alreadyInCart && <Chip tone="fresh">In cart</Chip>}
                      </div>
                      <p className="text-sm text-se-ink3">
                        {dog.breed?.name}
                      </p>
                      {dog.kcRegNumber && (
                        <p className="text-xs text-se-ink3">
                          RKC: {dog.kcRegNumber}
                        </p>
                      )}
                      {ageMonths !== null && show?.startDate && (
                        <p className="mt-1 text-xs text-se-ink3">
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
                          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-se-honey-deep" />
                          <p className="text-xs text-se-honey-deep">
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
            <SECard className="py-8 text-center">
              <AlertTriangle className="mx-auto mb-3 size-10 text-se-honey-deep" />
              <p className="font-medium text-se-ink">No eligible dogs</p>
              <p className="mb-4 text-sm text-se-ink3">
                This is a {showBreedName ?? 'single breed'} show. None of your registered dogs are this breed.
              </p>
              <Link href="/dogs/new" className={cn(SE_LINK_BTN_BASE, SE_LINK_BTN_VARIANT.ghost)}>
                Register a {showBreedName ?? 'new'} dog
              </Link>
            </SECard>
          ) : (
            <SECard className="py-8 text-center">
              <Dog className="mx-auto mb-3 size-10 text-se-ink3" />
              <p className="font-medium text-se-ink">No dogs registered yet</p>
              <p className="mb-4 text-sm text-se-ink3">
                You need to add a dog before entering a show.
              </p>
              <Link href="/dogs/new" className={cn(SE_LINK_BTN_BASE, SE_LINK_BTN_VARIANT.fresh)}>
                Add a Dog
              </Link>
            </SECard>
          )}

          {eligibleDogs && eligibleDogs.length > 0 && (
            <Link
              href="/dogs/new"
              className="inline-flex items-center gap-1 text-sm font-semibold text-se-fresh-deep hover:underline"
            >
              + Add a new dog
            </Link>
          )}

          <div className="flex justify-start pt-4">
            {hasJhClasses ? (
              <SEButton variant="ghost" size="sm" onClick={() => cart.setStep('entry_type')}>
                <ChevronLeft className="size-4" />
                Back
              </SEButton>
            ) : (
              <Link href={`/shows/${idOrSlug}`} className={cn(SE_LINK_BTN_BASE, SE_LINK_BTN_VARIANT.ghost)}>
                <ChevronLeft className="size-4" />
                Back to Show
              </Link>
            )}
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
            <h2 className="font-serif text-[22px] font-bold text-se-ink sm:text-[26px]">Junior Handler Details</h2>

            <div className="flex gap-3 rounded-[14px] border border-se-line bg-se-surface p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-se-fresh-deep" />
              <p className="text-sm text-se-ink2">
                Junior handling classes are judged on the handler&apos;s skill in presenting and moving their dog — not on the dog itself. Age is calculated on the first day of the show.
              </p>
            </div>

            <SECard className="space-y-4 p-4 sm:p-5">
              <div>
                <Label htmlFor="jh-name">Handler Name</Label>
                <Input
                  id="jh-name"
                  value={jhName}
                  onChange={(e) => setJhName(e.target.value)}
                  placeholder="Full name of handler"
                  className="mt-1 h-11"
                />
                <p className="mt-1 text-xs text-se-ink3">
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
                  <Chip tone="fresh" className="mt-2">Age on show day: {jhAgeYears} years</Chip>
                )}
                {jhAgeError && (
                  <p className="mt-2 text-sm font-medium text-destructive">
                    {jhAgeError}
                  </p>
                )}
                {!jhAgeError && jhAgeMonths !== null && !jhHasMatchingClasses && (
                  <div className="mt-2 flex gap-2 rounded-[10px] border border-se-honey bg-se-honey-soft p-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-se-honey-deep" />
                    <p className="text-sm text-se-honey-ink">
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
                <p className="mt-1 text-xs text-se-ink3">
                  YKC or JHA membership number, if applicable.
                </p>
              </div>
            </SECard>

            <div className="flex gap-2 pt-4">
              <SEButton variant="ghost" className="flex-1 sm:flex-none" size="sm" onClick={() => cart.setStep('entry_type')}>
                <ChevronLeft className="size-4" />
                Back
              </SEButton>
              <SEButton
                variant="fresh"
                className="flex-1 sm:flex-none"
                size="sm"
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
              </SEButton>
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

        // SV/WUSV health gate (Amanda 2026-05-21): for Yearling/Adult/Working
        // the dog must have hip + elbow + DNA on file. Server enforces this in
        // entries.create and orders.checkout, but we surface it here so the
        // exhibitor doesn't reach the cart Review step before being told.
        const SV_HEALTH_REQUIRED_CLASSES = new Set(['SV Yearling', 'Adult', 'Working']);
        const selectedSvHealthClasses = (showClasses ?? []).filter(
          (sc) =>
            selectedClassIds.includes(sc.id) &&
            sc.classDefinition &&
            SV_HEALTH_REQUIRED_CLASSES.has(sc.classDefinition.name),
        );
        const svHealthRequired =
          show?.showRuleset === 'wusv' &&
          cart.activeEntry?.entryType === 'standard' &&
          selectedSvHealthClasses.length > 0;
        const svHealthMissing: string[] = (() => {
          if (!svHealthRequired) return [];
          const profile = selectedDogSvProfile;
          const missing: string[] = [];
          const isEmpty = (v: string | null | undefined) => !v || v === 'not_required';
          if (isEmpty(profile?.hipGrade ?? null)) missing.push('hip score');
          if (isEmpty(profile?.elbowGrade ?? null)) missing.push('elbow score');
          if (!profile?.dna) missing.push('DNA recording');
          return missing;
        })();

        const dogAgeMonths =
          selectedDog?.dateOfBirth && show?.startDate
            ? differenceInMonths(new Date(show.startDate), new Date(selectedDog.dateOfBirth))
            : null;

        return (
        <div className="space-y-6">
          <div>
            <h2 className="font-serif text-[22px] font-bold text-se-ink sm:text-[26px]">Select classes</h2>
            <p className="text-xs text-se-ink3 sm:text-sm">
              {cart.activeEntry?.entryType === 'standard'
                ? `Choose classes for ${cart.activeEntry?.dogName ?? 'your dog'}`
                : `Choose classes for ${cart.activeEntry?.handlerName ?? 'the handler'}`}
            </p>
          </div>

          {/* Dog summary card — wiring task: Change reuses the Back handler */}
          {cart.activeEntry?.entryType === 'standard' && cart.activeEntry?.dogName && (
            <SECard className="flex items-center gap-3 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-se-fresh-soft text-se-fresh-deep">
                <Dog className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-se-ink">{cart.activeEntry.dogName}</p>
                <p className="truncate text-xs text-se-ink3">
                  {[
                    selectedDog?.breed?.name,
                    selectedDog?.sex === 'dog' ? 'Dog' : selectedDog?.sex === 'bitch' ? 'Bitch' : null,
                    dogAgeMonths !== null ? `${dogAgeMonths} months on show day` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleBackFromSelectClasses}
                className="shrink-0 text-xs font-semibold text-se-fresh-deep hover:underline"
              >
                Change
              </button>
            </SECard>
          )}

          {dogUnder6Months && (
            <div className="flex gap-3 rounded-[14px] border border-se-honey bg-se-honey-soft p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-se-honey-deep" />
              <div className="text-sm text-se-honey-ink">
                <p className="font-medium">This dog is under 6 months old on show day</p>
                <p className="mt-0.5 text-xs">
                  Per RKC regulations, dogs must be at least 6 months old for competition classes.
                  You can still enter Not For Competition (NFC) — tick the NFC checkbox below.
                </p>
              </div>
            </div>
          )}

          {svHealthMissing.length > 0 && (
            <div className="flex gap-3 rounded-[14px] border border-se-honey bg-se-honey-soft p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-se-honey-deep" />
              <div className="text-sm text-se-honey-ink">
                <p className="font-medium">
                  Health data required for{' '}
                  {selectedSvHealthClasses
                    .map((sc) => sc.classDefinition!.name)
                    .join(', ')}
                </p>
                <p className="mt-0.5 text-xs">
                  SV/WUSV rules require this dog to have a recorded{' '}
                  <strong>{svHealthMissing.join(', ')}</strong> before it can be
                  entered into these classes. Add the details on the dog&apos;s
                  profile, then come back to complete your entry.
                </p>
                {cart.activeEntry?.dogId && (
                  <Link
                    href={`/dogs/${cart.activeEntry.dogId}/edit`}
                    className={cn(SE_LINK_BTN_BASE, 'mt-2 h-9 min-h-0 border border-se-honey bg-white px-3 text-xs text-se-honey-ink hover:bg-se-honey-soft')}
                  >
                    Add health data to {cart.activeEntry.dogName ?? 'this dog'}
                  </Link>
                )}
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
                  {winSummary && (groupedClasses.age.length > 0 || groupedClasses.achievement.length > 0) && (() => {
                    const rec = winSummary.recommendation;
                    // Multi-class copy: when the suggestion is an achievement
                    // class (i.e. it's in the achievement `eligible` list —
                    // age-class suggestions aren't) and there's a runner-up,
                    // phrase it as "we suggest X or Y". Single-class + the
                    // existing reason string stay as the fallback.
                    const isAchievementSuggestion = !!rec.suggested && rec.eligible.includes(rec.suggested);
                    const second = isAchievementSuggestion
                      ? rec.eligible.find((name) => name !== rec.suggested)
                      : undefined;
                    return (
                      <div className="flex gap-2.5 rounded-[12px] border border-se-honey bg-se-honey-soft p-3">
                        <Star className="mt-0.5 size-[18px] shrink-0 text-se-honey-deep" />
                        <div>
                          <p className="text-[13px] font-bold text-se-honey-deep">
                            Recommended for {cart.activeEntry?.dogName ?? 'your dog'}
                          </p>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-se-ink2">
                            {rec.suggested ? (
                              isAchievementSuggestion && second ? (
                                <>We suggest <b className="text-se-ink">{rec.suggested}</b> or <b className="text-se-ink">{second}</b>.</>
                              ) : (
                                <>Suggested class: <b className="text-se-ink">{rec.suggested}</b>.</>
                              )
                            ) : (
                              'Eligible for all achievement classes.'
                            )}{' '}
                            {rec.reason}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                  {groupedClasses.sv_age.length > 0 && (
                    <>
                      {/* SV shows: warn when the dog has no coat type set
                          on its profile — without it we can't auto-filter
                          to the correct Standard/Long Coat class and the
                          exhibitor sees the list duplicated. Amanda
                          2026-05-20. */}
                      {show?.showRuleset === 'wusv' && !selectedDog?.coatType && (
                        <div className="flex gap-3 rounded-[14px] border border-se-honey bg-se-honey-soft p-3">
                          <Info className="mt-0.5 size-4 shrink-0 text-se-honey-deep" />
                          <p className="text-sm text-se-honey-ink">
                            <span className="font-medium">{selectedDog?.registeredName ?? 'This dog'}</span> doesn&apos;t have a coat type set on the profile yet. Both Standard Coat and Long Coat classes are showing — pick the correct one, or set the coat type on the dog&apos;s profile so we can filter automatically.
                          </p>
                        </div>
                      )}
                      {groupedClasses.sv_age.length === 1 && selectedClassIds.length === 1 && (
                        <div className="flex gap-3 rounded-[14px] border border-se-fresh-line bg-se-fresh-soft p-3">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-se-fresh-deep" />
                          <p className="text-sm text-se-ink2">
                            Based on your dog&apos;s age and coat type, they are eligible for{' '}
                            <span className="font-medium text-se-ink">{(groupedClasses.sv_age[0] as { classDefinition: { name: string } }).classDefinition.name}</span>.
                            This has been automatically selected.
                          </p>
                        </div>
                      )}
                      <ClassGroup
                        title="SV Age Classes"
                        classes={groupedClasses.sv_age}
                        selectedIds={selectedClassIds}
                        onToggle={toggleClass}
                        getAgeEligibility={getAgeEligibility}
                        dogName={selectedDog?.registeredName}
                      />
                    </>
                  )}
                  {groupedClasses.age.length > 0 && (
                    <ClassGroup
                      title="Age Classes"
                      classes={groupedClasses.age}
                      selectedIds={selectedClassIds}
                      onToggle={toggleClass}
                      getAgeEligibility={getAgeEligibility}
                      suggestedClassName={winSummary?.recommendation.suggested}
                      dogName={selectedDog?.registeredName}
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
                    <div className="flex gap-3 rounded-[14px] border border-se-fresh-line bg-se-fresh-soft p-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-se-fresh-deep" />
                      <p className="text-sm text-se-ink2">
                        Based on the handler&apos;s age, they are eligible for{' '}
                        <span className="font-medium text-se-ink">{availableClasses[0].classDefinition.name}</span>.
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
                      feeOverride={show.juniorHandlerFee ?? undefined}
                    />
                  ) : (
                    <div className="flex gap-3 rounded-[14px] border border-se-honey bg-se-honey-soft p-3">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-se-honey-deep" />
                      <p className="text-sm text-se-honey-ink">
                        No handling classes match the handler&apos;s age. Go back and check the date of birth.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* NFC option — RKC-only concept. Hidden for SV shows
                  (Amanda 2026-05-20). */}
              {cart.activeEntry?.entryType === 'standard' && show?.showRuleset !== 'wusv' && (
                <>
                  <Separator className="bg-se-line" />
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[14px] border border-se-line bg-se-surface p-3">
                    <Checkbox
                      checked={isNfc}
                      onCheckedChange={(checked) => setIsNfc(checked === true)}
                    />
                    <div>
                      <span className="font-medium text-se-ink">Not For Competition (NFC)</span>
                      <p className="text-sm text-se-ink3">
                        Enter classes for experience only, not competing for awards.
                      </p>
                    </div>
                  </label>
                </>
              )}
            </>
          )}

          {/* Running total */}
          <div className="sticky bottom-16 md:bottom-0 rounded-[16px] border border-se-line bg-se-surface p-3 shadow-[0_-4px_18px_-12px_rgba(27,36,29,0.25)] sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-se-ink3 sm:text-sm">
                  {selectedClassIds.length} class
                  {selectedClassIds.length !== 1 ? 'es' : ''} selected
                  {cart.activeEntry?.dogName ? ` · ${cart.activeEntry.dogName}` : ''}
                </p>
                <p className="text-2xl font-bold text-se-ink sm:text-[26px]">{formatCurrency(selectedTotal)}</p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <SEButton
                  variant="ghost"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={handleBackFromSelectClasses}
                >
                  <ChevronLeft className="size-4" />
                  Back
                </SEButton>
                <SEButton
                  variant="fresh"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={handleConfirmClasses}
                  disabled={
                    (selectedClassIds.length === 0 && !isNfc) ||
                    (dogUnder6Months && !isNfc) ||
                    svHealthMissing.length > 0
                  }
                >
                  {cart.editingExisting ? 'Update' : 'Add to Cart'}
                  <ChevronRight className="size-4" />
                </SEButton>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Step: Cart Review */}
      {cart.step === 'cart_review' && (
        <div className="space-y-6">
          <h2 className="font-serif text-[22px] font-bold text-se-ink sm:text-[26px]">Review your entries</h2>

          {/* Show info — rich summary */}
          <SECard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-serif text-base font-bold text-se-ink">{show.name}</p>
                {show.showType && (
                  <Chip className="mt-1 capitalize">{show.showType.replace('_', ' ')}</Chip>
                )}
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-sm text-se-ink2">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-3.5 shrink-0 text-se-ink3" />
                {format(parseISO(show.startDate), 'EEEE d MMMM yyyy')}
              </div>
              {show.venue && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 shrink-0 text-se-ink3" />
                  {show.venue.name}{show.venue.postcode ? `, ${show.venue.postcode}` : ''}
                </div>
              )}
              {show.organisation && (
                <div className="flex items-center gap-2">
                  <Ticket className="size-3.5 shrink-0 text-se-ink3" />
                  {(show.organisation as { name?: string }).name}
                </div>
              )}
              {show.secretaryEmail && (
                <a
                  href={`mailto:${show.secretaryEmail}?subject=Entry query — ${show.name}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-se-fresh-deep hover:underline"
                >
                  <Mail className="size-3" />
                  Contact show secretary
                </a>
              )}
            </div>
          </SECard>

          {/* Cart entries */}
          {cart.entries
            .filter((e) => e.classIds.length > 0 || e.isNfc)
            .map((entry) => (
              <SECard key={entry.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold text-se-ink">
                      {entry.entryType === 'standard'
                        ? entry.dogName ?? 'Dog'
                        : `Junior Handler: ${entry.handlerName}`}
                    </p>
                    {entry.breedName && (
                      <p className="text-sm text-se-ink3">{entry.breedName}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Edit entry"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-se-ink2 hover:bg-se-paper2"
                      onClick={() => cart.editEntry(entry.id)}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove entry"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-se-paper2"
                      onClick={() => cart.removeEntry(entry.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-2 text-sm">
                  {entry.entryType === 'junior_handler' && entry.handlerDob && show?.startDate && (
                    <div className="flex flex-wrap gap-2">
                      <Chip tone="fresh">
                        Age on show day: {handlerAgeYearsOnDate(entry.handlerDob, show.startDate)} years
                      </Chip>
                      {entry.handlerKcNumber && (
                        <Chip>Membership: {entry.handlerKcNumber}</Chip>
                      )}
                    </div>
                  )}
                  {entry.classNames.length > 0 ? (
                    <ul className="space-y-0.5 text-se-ink3">
                      {entry.classNames.map((name, i) => (
                        <li key={i}>{name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-se-ink3">
                      {entry.classIds.length} class
                      {entry.classIds.length !== 1 ? 'es' : ''}
                    </p>
                  )}
                  {entry.isNfc && (
                    <p className="text-xs font-semibold text-se-honey-deep">NOT FOR COMPETITION</p>
                  )}
                  <p className="font-bold text-se-ink">{formatCurrency(entry.totalFee)}</p>
                </div>
              </SECard>
            ))}

          {/* Add another */}
          {addDogsButtons}

          {/* Sundry items (catalogues, memberships, donations, etc.) — shown BEFORE total */}
          {sundryItemsData && sundryItemsData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-se-ink">Add-ons</h3>
              <p className="text-xs text-se-ink3">
                Optional extras available for this show — catalogues, memberships, and more.
              </p>
              {sundryItemsData.map((item) => {
                const inCart = cart.sundryItems.find((s) => s.sundryItemId === item.id);
                const isCheckbox = item.maxPerOrder === 1;

                if (isCheckbox) {
                  return (
                    <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-se-line bg-se-surface p-3">
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
                        className="mt-0.5 rounded-[6px] border-se-line2 data-[state=checked]:border-se-green data-[state=checked]:bg-se-green data-[state=checked]:text-white"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-se-ink">{item.name}</span>
                        <span className="ml-2 text-sm text-se-ink3">
                          {formatCurrency(item.priceInPence)}
                        </span>
                        {item.description && (
                          <p className="text-xs text-se-ink3 mt-0.5">{item.description}</p>
                        )}
                      </div>
                    </label>
                  );
                }

                // Quantity stepper for items with maxPerOrder > 1 or unlimited
                const qty = inCart?.quantity ?? 0;
                const max = item.maxPerOrder;

                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-se-line bg-se-surface p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-se-ink">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-se-ink3 mt-0.5">{item.description}</p>
                      )}
                      <p className="text-xs text-se-ink3">
                        {formatCurrency(item.priceInPence)} each
                        {max ? ` · max ${max}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={qty === 0}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full text-se-ink2 shadow-[inset_0_0_0_1px_#d7cfba] disabled:opacity-40"
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
                      </button>
                      <span className="w-6 text-center text-sm font-medium text-se-ink">{qty}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        disabled={max != null && qty >= max}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full text-se-ink2 shadow-[inset_0_0_0_1px_#d7cfba] disabled:opacity-40"
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
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Discount group declaration — only when the show offers groups */}
          {discountGroups && discountGroups.length > 0 && (
            <SECard className="p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-se-ink">Are you eligible for a discount?</p>
                <p className="text-xs text-se-ink3">
                  Tick the option that applies to you. By checking it you confirm you qualify.
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {discountGroups.map((g) => (
                  <label key={g.id} className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-se-line p-3 hover:bg-se-paper2/60">
                    <input
                      type="radio"
                      name="discount-group"
                      checked={discountGroupId === g.id}
                      onChange={() => setDiscountGroupId(g.id)}
                      className="mt-0.5 size-4 cursor-pointer accent-se-green"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-se-ink">I am a {g.label}</span>
                      <span className="ml-2 text-xs text-se-ink3">
                        {formatCurrency(g.firstEntryFeePence)}/first class
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-se-line p-3 hover:bg-se-paper2/60">
                  <input
                    type="radio"
                    name="discount-group"
                    checked={discountGroupId === null}
                    onChange={() => setDiscountGroupId(null)}
                    className="mt-0.5 size-4 cursor-pointer accent-se-green"
                  />
                  <span className="text-sm font-medium text-se-ink">None of the above (standard rate)</span>
                </label>
              </div>
            </SECard>
          )}

          {/* Multi-dog savings banner */}
          {feePreview?.multiDogApplied && feePreview.multiDogSavings > 0 && (
            <div className="rounded-[14px] border border-se-fresh-line bg-se-fresh-soft px-4 py-3 text-sm text-se-ink">
              <p className="font-medium">
                Multi-dog discount applied — saving {formatCurrency(feePreview.multiDogSavings)}
              </p>
              <p className="mt-0.5 text-xs text-se-ink2">
                You&apos;ve entered {feePreview.payingDogCount} dogs in paying classes.
              </p>
            </div>
          )}

          {/* Grand total with breakdown */}
          <div className="rounded-[16px] border border-se-line bg-se-paper2 p-3 sm:p-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm text-se-ink3">
                <span>
                  {cart.entries.filter((e) => e.classIds.length > 0 || e.isNfc).length} entr
                  {cart.entries.filter((e) => e.classIds.length > 0 || e.isNfc).length !== 1 ? 'ies' : 'y'}
                </span>
                <span>{formatCurrency(feePreview?.total ?? cart.entriesTotal)}</span>
              </div>
              {cart.sundryTotal > 0 && (
                <div className="flex justify-between text-sm text-se-ink3">
                  <span>Add-ons</span>
                  <span>{formatCurrency(cart.sundryTotal)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-se-line2 pt-1.5 text-sm font-bold text-se-ink sm:text-base">
                <span>Grand Total</span>
                <span>{formatCurrency((feePreview?.total ?? cart.entriesTotal) + cart.sundryTotal)}</span>
              </div>
            </div>
          </div>

          {/* Second add-dog button — easier to find after scrolling through entries */}
          {cart.entries.length >= 2 && addDogsButtons}

          {/* Declaration — RKC wording for RKC shows, GSDL/WUSV placeholder
              wording for SV shows. Amanda 2026-05-20 will source the
              official SV declaration; until then a sensible placeholder
              that names the right ruleset. */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-se-ink">
              {show?.showRuleset === 'wusv' ? 'GSDL-BRG Declaration' : 'RKC Declaration'}
            </h3>
            <div className="max-h-40 overflow-y-auto rounded-[10px] border border-se-line bg-se-paper2 p-3 text-xs leading-relaxed text-se-ink3">
              {show?.showRuleset === 'wusv' ? (
                <>
                  I/We agree to abide by the GSDL-British Regional Group Rules &amp; Regulations (based on WUSV/SV Rules &amp; Regulations) for this Regional Event. I/We confirm that the information provided about the dog is accurate, and that the dog meets the eligibility requirements for the classes entered — including any health test disclosure, DNA recording, Koerung or working title requirements that apply to the class. I/We undertake not to bring to the Event any dog which has contracted or been knowingly exposed to any infectious or contagious disease during the 21 days prior to the Event, or which is suffering from a visible condition that adversely affects its health or welfare. I/We acknowledge that exhibitors are obligated to make true statements about their dog(s) and to show sportsmanlike conduct; any attempt at deception may result in disqualification and disciplinary action by the GSDL-BRG.
                </>
              ) : (
                <>
                  I/We agree to submit to and be bound by Royal Kennel Club Limited
                  Rules &amp; Regulations in their present form or as they may be
                  amended from time to time in relation to all canine matters with
                  which the Royal Kennel Club is concerned and that this entry is
                  made upon the basis that all current single or joint registered
                  owners of this dog(s) have authorised/consented to this entry.
                  I/We also undertake to abide by the Regulations of this Show and
                  not to bring to the Show any dog which has contracted or been
                  knowingly exposed to any infectious or contagious disease during
                  the 21 days prior to the Show, or which is suffering from a
                  visible condition which adversely affects its health or welfare or
                  to bring any dog which has been prepared for exhibition contrary
                  to Royal Kennel Club Regulations for the Preparation of Dogs for
                  Exhibition F (Annex B). I/We agree without reservation that any
                  Veterinary Surgeon operating on any of my/our dogs in such a way
                  that the operation alters the natural conformation of the dog or
                  part thereof may report such operations to the Royal Kennel Club.
                  I/We declare that where any alteration has been made to the
                  natural conformation of the dog(s) the relevant permission to show
                  has been granted by the Royal Kennel Club. I/We further declare
                  that I believe to the best of my knowledge that the dogs are not
                  liable to disqualification under Royal Kennel Club Show
                  Regulations. I/We also confirm that I/we understand the
                  eligibility of the classes entered.
                </>
              )}
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={healthDeclared && termsAccepted}
                onCheckedChange={(checked) => {
                  const val = checked === true;
                  setHealthDeclared(val);
                  setTermsAccepted(val);
                }}
                className="mt-0.5 rounded-[6px] border-se-line2 data-[state=checked]:border-se-green data-[state=checked]:bg-se-green data-[state=checked]:text-white"
              />
              <span className="text-sm font-medium leading-relaxed text-se-ink">
                I agree to the above declaration
              </span>
            </label>
          </div>

          {/* Privacy: right to withhold from catalogue — RKC F(1).11.b.(6)/(8) */}
          <SECard className="p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={withholdFromPublication}
                onCheckedChange={(checked) => setWithholdFromPublication(checked === true)}
                className="mt-0.5 rounded-[6px] border-se-line2 data-[state=checked]:border-se-green data-[state=checked]:bg-se-green data-[state=checked]:text-white"
              />
              <span className="text-sm leading-relaxed">
                <span className="font-medium text-se-ink">Keep my name and address out of the catalogue</span>
                <span className="mt-1 block text-xs text-se-ink3">
                  Your dog&apos;s registered name and pedigree details will still appear — only your owner details will be withheld.
                  This is your right under Kennel Club regulation F(1).11.b.
                </span>
              </span>
            </label>
          </SECard>

          {checkoutMutation.error && (
            <div className="rounded-[14px] bg-destructive/10 p-3 text-sm text-destructive">
              {checkoutMutation.error.message}
            </div>
          )}

          <div className="flex gap-2">
            <SEButton
              variant="ghost"
              className="text-sm sm:text-base"
              onClick={() => {
                const lastEntry = cart.entries.filter((e) => e.classIds.length > 0 || e.isNfc).pop();
                if (lastEntry) {
                  cart.editEntry(lastEntry.id);
                }
              }}
            >
              <ChevronLeft className="size-4" />
              Back
            </SEButton>
            <SEButton
              variant="fresh"
              className="flex-1 text-sm sm:text-base"
              onClick={handleProceedToPayment}
              disabled={
                !healthDeclared ||
                !termsAccepted ||
                checkoutMutation.isPending ||
                // An entry is submittable if it has at least one class OR it's
                // an NFC ("not for competition") entry — those deliberately have
                // no classes. Mirrors the filter in handleProceedToPayment's
                // mutation payload; previously they diverged and NFC-only carts
                // were silently blocked here.
                cart.entries.filter((e) => e.classIds.length > 0 || e.isNfc).length === 0
              }
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {(() => {
                    const previewGrand = (feePreview?.total ?? cart.entriesTotal) + cart.sundryTotal;
                    if (previewGrand === 0) return 'Confirm Entry — Free';
                    return <>Proceed to Payment &middot; {formatCurrency(previewGrand)}</>;
                  })()}
                </>
              )}
            </SEButton>
          </div>
        </div>
      )}

      {/* Step: Payment — font-sans deliberately restores Inter here (the
          .show-exp wrapper's Hanken Grotesk otherwise cascades into every
          descendant); this whole block's markup is untouched, see notes. */}
      {cart.step === 'payment' && clientSecret && (
        <div className="space-y-6 font-sans">
          <h2 className="text-base font-semibold sm:text-lg">Payment</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pay {formatCurrency(paymentAmount)}
              </CardTitle>
              <CardDescription>Secure payment powered by Stripe</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {platformFeePence > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Entry fees</span>
                    <span>{formatCurrency(subtotalAmount)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-muted-foreground">
                    <span>
                      Platform fee{' '}
                      <span className="text-xs opacity-75">(£1 + 1%)</span>
                    </span>
                    <span>{formatCurrency(platformFeePence)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t pt-2 font-semibold text-foreground">
                    <span>Total</span>
                    <span>{formatCurrency(paymentAmount)}</span>
                  </div>
                </div>
              )}

              <StripeProvider clientSecret={clientSecret}>
                <PaymentForm
                  amount={paymentAmount}
                  onSuccess={handlePaymentSuccess}
                  onBack={() => {
                    cart.setStep('cart_review');
                    setClientSecret(null);
                    try { localStorage.removeItem(getPaymentKey(idOrSlug)); } catch { /* private mode */ }
                  }}
                />
              </StripeProvider>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Confirmation */}
      {cart.step === 'confirmation' && (() => {
        const confirmedEntries = cart.entries.filter((e) => e.classIds.length > 0 || e.isNfc);
        // First name / email come straight from the session, same pattern as
        // dashboard/page.tsx (`session?.user?.name?.split(' ')[0]`) — skipped
        // entirely if the session hasn't got them.
        const firstName = session?.user?.name?.split(' ')[0];
        const userEmail = session?.user?.email;
        // Existing, honest copy (no promised running-order email date — that
        // send doesn't exist). Show day only adds the doors time when the
        // show actually has one set.
        const timelineRows: [string, string][] = [
          ['Now', "You'll receive a confirmation email shortly with your entry details."],
          ['Before the show', 'Ring numbers and catalogue details will be emailed to you before the show.'],
          [
            'Show day',
            show.showOpenTime
              ? `Doors ${show.showOpenTime} — bring your entry confirmation.`
              : 'Bring your entry confirmation on show day.',
          ],
        ];

        return (
        <div className="space-y-6">
          {/* Dark hero */}
          <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-b from-se-deep to-se-deepest px-5 py-8 text-center text-se-cream">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-12 top-5 size-48 rounded-full opacity-25"
              style={{ background: 'radial-gradient(circle, #5bb579, transparent 68%)' }}
            />
            <div className="relative mx-auto flex size-16 items-center justify-center rounded-full bg-se-fresh text-[#0e2c19] shadow-[0_16px_34px_-14px_rgba(0,0,0,0.55)]">
              <CheckCircle2 className="size-8" />
            </div>
            <h2 className="relative mt-3.5 font-serif text-[26px] font-bold text-se-cream sm:text-[29px]">
              You&apos;re entered{firstName ? `, ${firstName}` : ''}!
            </h2>
            <p className="relative mt-1.5 text-[13.5px] text-se-cream/80">
              {confirmedEntries.length} {confirmedEntries.length === 1 ? 'entry' : 'entries'} &middot; {formatCurrency(paymentAmount)} paid
            </p>
            {userEmail && (
              <p className="relative mt-3 inline-flex items-center gap-1.5 text-xs text-se-cream/75">
                <Mail className="size-3.5" />
                Confirmation sent to {userEmail}
              </p>
            )}
          </div>

          {/* Order details */}
          <SECard className="p-4">
            <div className="space-y-3 text-sm">
              {orderId && (
                <div className="flex justify-between">
                  <span className="text-se-ink3">Order Reference</span>
                  <span className="font-mono font-medium text-se-ink">
                    {orderId.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-se-ink3">Entries</span>
                <span className="text-se-ink">{confirmedEntries.length}</span>
              </div>
              {confirmedEntries.map((entry) => (
                <div key={entry.id} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-se-ink">
                      {entry.entryType === 'standard'
                        ? entry.dogName
                        : `JH: ${entry.handlerName}`}
                    </span>
                    <span className="text-se-ink3">{entry.classIds.length} classes</span>
                  </div>
                  {entry.classNames.length > 0 && (
                    <ul className="ml-1 space-y-0.5 text-xs text-se-ink3">
                      {entry.classNames.map((name, i) => (
                        <li key={i}>{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <div className="flex justify-between border-t border-se-line pt-3 text-base font-bold text-se-ink">
                <span>Paid</span>
                <span>{formatCurrency(paymentAmount)}</span>
              </div>
            </div>
          </SECard>

          {/* What happens next — timeline */}
          <div>
            <SecLabel>What happens next</SecLabel>
            <SECard className="px-4">
              {timelineRows.map(([k, t], i) => (
                <div key={k} className={cn('flex gap-3 py-3', i > 0 && 'border-t border-se-line')}>
                  <span className="w-[92px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-se-honey-deep">
                    {k}
                  </span>
                  <span className="text-[13.5px] leading-relaxed text-se-ink2">{t}</span>
                </div>
              ))}
            </SECard>
          </div>

          {/* Share prompt — dark "Bring your ring-mates" card */}
          {(() => {
            const standardEntries = cart.entries.filter(
              (e) => e.classIds.length > 0 && e.entryType === 'standard'
            );
            const dogLabel =
              standardEntries.length === 1
                ? standardEntries[0]!.dogName ?? 'my dog'
                : standardEntries.length > 1
                  ? 'my dogs'
                  : 'my entry';
            const showUrl = `https://remishowmanager.co.uk/shows/${show?.slug ?? idOrSlug}`;
            const shareText = `I've just entered ${dogLabel} into ${show?.name ?? 'a show'}! \u{1F415} ${showUrl}`;
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

            const trackShare = (channel: string) => {
              if (!show?.id) return;
              fetch('/api/share-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ showId: show.id, channel }),
                keepalive: true,
              }).catch(() => {
                // Fire-and-forget
              });
            };
            const fbShareUrl = `${showUrl}?src=facebook`;

            return (
              <div className="mx-auto w-full max-w-md rounded-[16px] bg-gradient-to-br from-se-deep to-se-deepest p-4 text-center text-se-cream">
                <p className="text-sm font-semibold">
                  You&apos;re in! Let your breed group know you&apos;re coming.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackShare('whatsapp')}
                    className={cn(SE_LINK_BTN_BASE, 'bg-[#25D366] text-white')}
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </a>
                  <button
                    type="button"
                    className={cn(SE_LINK_BTN_BASE, 'bg-white text-[#1877F2]')}
                    onClick={async () => {
                      trackShare('facebook');
                      // Mobile: FB app hijacks facebook.com URLs and shows
                      // a blank screen — copy the link instead (years-old
                      // Meta bug, no client-side fix). Desktop: no app to
                      // intercept so the web sharer works fine.
                      const mobile =
                        typeof navigator !== 'undefined' &&
                        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                      if (mobile) {
                        try {
                          await navigator.clipboard.writeText(fbShareUrl);
                          toast.success('Link copied — paste it into your Facebook post or group');
                        } catch {
                          toast.error('Could not copy the link. Long-press to copy it manually.');
                        }
                        return;
                      }
                      window.open(
                        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fbShareUrl)}`,
                        '_blank',
                        'noopener,noreferrer'
                      );
                    }}
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073" />
                    </svg>
                    Facebook
                  </button>
                  <button
                    type="button"
                    className={cn(SE_LINK_BTN_BASE, SE_LINK_BTN_VARIANT.onDark)}
                    onClick={async () => {
                      trackShare('copy');
                      if (typeof navigator !== 'undefined' && navigator.share) {
                        try {
                          await navigator.share({
                            title: show?.name ?? 'Dog Show Entry',
                            text: `I've just entered ${dogLabel} into ${show?.name ?? 'a show'}! \u{1F415}`,
                            url: showUrl,
                          });
                          return;
                        } catch (e) {
                          if ((e as Error).name === 'AbortError') return;
                        }
                      }
                      try {
                        await navigator.clipboard.writeText(shareText);
                        setShareCopied(true);
                        toast.success('Copied! Paste into Facebook, breed groups, etc.');
                        setTimeout(() => setShareCopied(false), 2000);
                      } catch {
                        toast.error('Could not copy to clipboard');
                      }
                    }}
                  >
                    {shareCopied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {shareCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
                <p className="mt-3 text-xs italic text-se-cream/70">
                  A share from you is worth ten from us.
                </p>
                <p className="mt-3 flex items-start justify-center gap-1.5 text-[11.5px] leading-relaxed text-se-cream/60">
                  <Lock className="mt-0.5 size-3 shrink-0" />
                  Entirely your choice — it shares only what you see here, never your dog&apos;s details.
                </p>
              </div>
            );
          })()}

          {/* Add to calendar — route already exists */}
          <a
            href={`/api/shows/${show.id}/calendar`}
            className={cn(SE_LINK_BTN_BASE, SE_LINK_BTN_VARIANT.ghost, 'mx-auto w-full max-w-md')}
          >
            <CalendarPlus className="size-4" />
            Add show day to calendar
          </a>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/entries" className={cn(SE_LINK_BTN_BASE, SE_LINK_BTN_VARIANT.fresh)}>
              View My Entries
            </Link>
            <SEButton
              variant="ghost"
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
            </SEButton>
          </div>

          {/* Catalogue purchase note */}
          {cart.sundryItems.some((s) => isCatalogueItem(s.name)) && (
            <SECard className="mx-auto w-full max-w-md border-se-fresh-line bg-se-fresh-soft p-4 text-center">
              <p className="text-sm font-semibold text-se-fresh-deep">
                Online Catalogue Purchased
              </p>
              <p className="mt-1 text-xs text-se-ink2">
                Your catalogue will be available at{' '}
                <Link
                  href={`/shows/${show?.slug ?? idOrSlug}/catalogue`}
                  className="underline font-medium text-se-fresh-deep"
                >
                  this link
                </Link>{' '}
                once entries close.
              </p>
            </SECard>
          )}
        </div>
        );
      })()}
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

/** Humanizes a class age-bound (in months) for the ineligible-reason pill.
 *  Round multiples of a year — e.g. Veteran's 84-month minimum — read far
 *  more naturally as "7 years" than "84 months". Anything not year-aligned
 *  (Puppy/Junior/etc. bounds) stays in months. */
function formatAgeBoundForReason(months: number): string {
  if (months >= 24 && months % 12 === 0) {
    return `${months / 12} years`;
  }
  return `${months} months`;
}

function ClassGroup({
  title,
  classes,
  selectedIds,
  onToggle,
  getAgeEligibility,
  eligibleClassNames,
  suggestedClassName,
  feeOverride,
  dogName,
}: {
  title: string;
  classes: ShowClassItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  getAgeEligibility?: (
    min: number | null,
    max: number | null
  ) => { ageMonths: number; eligible: boolean; failedBound: 'min' | 'max' | null } | null;
  eligibleClassNames?: string[];
  suggestedClassName?: string | null;
  feeOverride?: number | null;
  dogName?: string | null;
}) {
  const [showAllLocked, setShowAllLocked] = useState(false);

  // Split age/sv_age classes into ones the dog is age-eligible for
  // (selectable, as before) and ones it isn't (shown locked-with-reason
  // rather than silently hidden). Sex/coat/AVNSC/JH-age filtering all
  // happen upstream (groupedClasses / availableClasses) before classes
  // ever reach this component, so those stay completely hidden — only
  // age-based ineligibility becomes a visible locked row here.
  const unlockedClasses: ShowClassItem[] = [];
  const lockedClasses: Array<{ sc: ShowClassItem; reason: string }> = [];
  for (const sc of classes) {
    const isAgeType = sc.classDefinition.type === 'age' || sc.classDefinition.type === 'sv_age';
    const elig = isAgeType && getAgeEligibility
      ? getAgeEligibility(sc.classDefinition.minAgeMonths, sc.classDefinition.maxAgeMonths)
      : null;
    if (!elig || elig.eligible) {
      unlockedClasses.push(sc);
      continue;
    }
    const { minAgeMonths, maxAgeMonths } = sc.classDefinition;
    const reason = elig.failedBound === 'min'
      ? `Under ${formatAgeBoundForReason(minAgeMonths ?? 0)} on show day`
      : `Over ${formatAgeBoundForReason(maxAgeMonths ?? 0)} on show day`;
    lockedClasses.push({ sc, reason });
  }

  if (unlockedClasses.length === 0 && lockedClasses.length === 0) return null;

  const LOCKED_COLLAPSE_THRESHOLD = 4;
  const shouldCollapseLocked = lockedClasses.length > LOCKED_COLLAPSE_THRESHOLD;
  const visibleLocked = shouldCollapseLocked && !showAllLocked ? [] : lockedClasses;

  return (
    <div>
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-se-ink3">
        {title}
      </h3>
      <div className="rounded-[14px] border border-se-line bg-se-surface px-3.5">
        {unlockedClasses.map((sc, i) => {
          const isSelected = selectedIds.includes(sc.id);
          const isSuggested = suggestedClassName === sc.classDefinition.name;
          const isIneligible = eligibleClassNames && !eligibleClassNames.includes(sc.classDefinition.name);
          return (
            <label
              key={sc.id}
              className={cn(
                'flex min-h-[44px] cursor-pointer items-center gap-3 py-2.5',
                i > 0 && 'border-t border-se-line',
                isIneligible && 'opacity-50',
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggle(sc.id)}
                className="size-6 shrink-0 rounded-[7px] border-se-line2 data-[state=checked]:border-se-green data-[state=checked]:bg-se-green data-[state=checked]:text-white"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className={cn('text-[14.5px]', isSelected ? 'font-semibold text-se-ink' : 'font-medium text-se-ink')}>
                    {sc.classDefinition.name.replace(/^SV\s+/, '')}
                    {sc.sex && (
                      <span className="ml-1">
                        {sc.sex === 'dog' ? 'Dog' : 'Bitch'}
                      </span>
                    )}
                    {/* Surface coat type on SV classes so secretaries +
                        exhibitors can distinguish the otherwise-identical
                        Adult Bitch (stock) and Adult Bitch (long_stock)
                        rows. Amanda 2026-05-20. */}
                    {(sc as { svCoatType?: 'stock' | 'long_stock' | null }).svCoatType && (
                      <span className="ml-1 text-se-ink3">
                        — {(sc as { svCoatType?: 'stock' | 'long_stock' }).svCoatType === 'long_stock' ? 'Long Coat' : 'Standard Coat'}
                      </span>
                    )}
                  </span>
                  {isSuggested && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-se-honey-soft px-2 py-0.5 text-[10.5px] font-bold text-se-honey-deep">
                      <Star className="size-2.5" />
                      Recommended
                    </span>
                  )}
                  {isIneligible && (
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] text-se-ink3 shadow-[inset_0_0_0_1px_#e7e1d3]">
                      May not be eligible
                    </span>
                  )}
                </div>
                {sc.classDefinition.description && (
                  <p className="text-sm text-se-ink3">
                    {sc.classDefinition.description}
                  </p>
                )}
              </div>
              <span className={cn('shrink-0 text-[14.5px] font-bold', isSelected ? 'text-se-fresh-deep' : 'text-se-ink3')}>
                {formatCurrency(feeOverride != null ? feeOverride : sc.entryFee)}
              </span>
            </label>
          );
        })}

        {/* Age-ineligible classes: locked-with-reason rather than hidden,
            so exhibitors can see why a class is missing. Never selectable,
            never priced, never counted toward the total. */}
        {shouldCollapseLocked && (
          <button
            type="button"
            onClick={() => setShowAllLocked((v) => !v)}
            className={cn(
              'w-full py-2.5 text-left text-[12.5px] font-semibold text-se-ink3 underline underline-offset-2',
              unlockedClasses.length > 0 && 'border-t border-se-line',
            )}
          >
            {showAllLocked
              ? 'Hide'
              : `Show ${lockedClasses.length} classes ${dogName ?? 'this dog'} isn't eligible for`}
          </button>
        )}
        {visibleLocked.map(({ sc, reason }, i) => (
          <div
            key={sc.id}
            className={cn(
              'flex min-h-[44px] items-center gap-3 py-2.5 opacity-50',
              (i > 0 || unlockedClasses.length > 0 || (shouldCollapseLocked && showAllLocked)) &&
                'border-t border-se-line',
            )}
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-[7px] border border-se-line2 bg-se-paper2">
              <Lock className="size-3 text-se-ink3" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[14.5px] font-medium text-se-ink3">
                {sc.classDefinition.name.replace(/^SV\s+/, '')}
                {sc.sex && <span className="ml-1">{sc.sex === 'dog' ? 'Dog' : 'Bitch'}</span>}
              </span>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-se-paper2 px-2.5 py-0.5 text-[11px] font-semibold text-se-ink3">
              {reason}
            </span>
          </div>
        ))}
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
