import { useReducer, useCallback, useEffect } from 'react';
import type { SundryKind } from '@/lib/sundry-kind';
import { computeOrderFees } from '@/lib/fee-calc';

export type EntryType = 'standard' | 'junior_handler';

export interface CartEntry {
  id: string; // local client-side ID
  entryType: EntryType;
  dogId?: string;
  dogName?: string;
  breedName?: string;
  classIds: string[];
  classNames: string[]; // human-readable class names for cart review
  isNfc: boolean;
  totalFee: number;
  /** RKC paperwork pending for THIS show — see lib/registration-flags.ts.
   *  Per entry, not per dog: the RKC judges the position at closing date. */
  naf?: boolean;
  taf?: boolean;
  cnaf?: boolean;
  /** Authority to Compete number for an overseas dog, e.g. ATC01234SWE. */
  atcNumber?: string;
  // Junior handler fields
  handlerName?: string;
  handlerDob?: string;
  handlerKcNumber?: string;
}

export interface CartSundryItem {
  sundryItemId: string;
  name: string;
  quantity: number;
  unitPrice: number; // pence
  maxPerOrder: number | null;
  /** What the item IS (sundry_items.kind). Carried in the basket so the
   *  confirmation still knows after a reload or a Stripe 3DS return, when the
   *  item list isn't loaded. Optional: baskets saved before 15 Oct 2026. */
  kind?: SundryKind;
}

export interface SelectedClassForPricing {
  /** True for a Special Award Class — charged its own `entryFee`, never the tier. */
  isSpecial: boolean;
  /** The class's own entry_fee (pence). Only used when `isSpecial` is true. */
  entryFee: number;
}

/**
 * Running total for the classes currently selected in the class-picker, for a
 * STANDARD (non-NFC, non-JH, non-regional) show using show-level first/
 * subsequent fee tiers.
 *
 * Delegates to `computeOrderFees` — the SAME engine the server checkout and
 * the cart-review preview use — instead of hand-rolling `first + subsequent *
 * (count - 1)`. That hand-rolled version was the fee-display bug Mandy
 * reported 2026-07-21: a Special Award Class (its own low fee, e.g. £3) was
 * shown at the normal first-class tier rate (e.g. £20) in both the
 * class-picker running total AND the dog's card in the entry cart, because
 * `3d1f4e5` taught the server + checkout preview about `specialClassFees` but
 * not this client running-total calc. Checkout itself was always correct —
 * this was purely a display bug. Never hand-duplicate fee logic again; route
 * new pricing branches through `computeOrderFees`.
 *
 * Deliberately has NO multi-dog-package or discount-group awareness — this
 * mirrors the pre-existing (pre-bug) behaviour: it's a per-dog estimate shown
 * while picking classes, before the exhibitor has declared a discount group.
 * The authoritative, package/discount-aware total is computed separately for
 * the checkout preview once all dogs are in the cart.
 */
export function computeClassSelectionTotal(
  selectedClasses: SelectedClassForPricing[],
  firstEntryFeePence: number,
  subsequentEntryFeePence: number | null,
): number {
  if (selectedClasses.length === 0) return 0;
  const specialClassFees = selectedClasses.map((c) => (c.isSpecial ? c.entryFee : null));
  const result = computeOrderFees(
    [
      {
        key: 'selection',
        kind: 'standard',
        classCount: selectedClasses.length,
        specialClassFees,
      },
    ],
    {
      firstEntryFeePence,
      subsequentEntryFeePence,
      nfcEntryFeePence: null,
      juniorHandlerFeePence: null,
      multiDogThreshold: null,
      multiDogPackagePence: null,
    },
  );
  return result.total;
}

export type WizardStep =
  | 'entry_type'
  | 'select_dog'
  | 'junior_handler'
  | 'select_classes'
  | 'cart_review'
  | 'payment'
  | 'confirmation';

export interface CartState {
  entries: CartEntry[];
  sundryItems: CartSundryItem[];
  activeEntryId: string | null;
  step: WizardStep;
  editingExisting: boolean;
  /**
   * The discount group ("I am a Member" etc.) the exhibitor has declared for
   * this order — id from show_discount_groups, or null for the standard
   * rate. Lives on the CART, persisted to localStorage with everything else,
   * NOT page useState. It used to be page state (~L217 of page.tsx) and
   * defaulted to null every remount, so a reload, a Safari tab eviction, or
   * the Add/Edit-dog detour (`/dogs/new?returnTo=…` unmounts the page)
   * silently reset a ticked member back to the standard rate while the rest
   * of the cart survived — Paula Ingham paid £18 instead of £16 at the North
   * Eastern GSD Club champ show (28 Aug) this way. Optional (not every
   * persisted cart pre-dating this field carries it) — always read it via
   * the hook's normalised `discountGroupId` (never `state.discountGroupId`
   * directly), which defaults a missing/undefined value to null.
   */
  discountGroupId?: string | null;
  /**
   * Who is buying, when nobody is signed in (extras without a dog, slice 2).
   * Name + email only. Persisted with the cart so the Stripe 3DS return can
   * still say "we've emailed your receipt to …". Optional: carts saved before
   * 16 Oct 2026 don't have it — read it via the hook's normalised `buyer`.
   */
  buyer?: BuyerDetails | null;
  /**
   * The order + PaymentIntent secret from this browser's last GUEST checkout.
   * Sent back as `previousOrder` so the server can cancel the abandoned payment
   * (the secret proves this browser made it). Survives payment Back; cleared on
   * confirmation and reset. Optional, as `buyer`.
   */
  lastCheckout?: LastCheckout | null;
}

export interface BuyerDetails {
  name: string;
  email: string;
}

export interface LastCheckout {
  orderId: string;
  clientSecret: string;
}

/**
 * ONE owner for "are these buyer details good enough to place an order":
 * a name of at least 2 characters (trimmed) and an email of a sane shape.
 * The server re-checks with zod; this only decides whether the button is on.
 */
export function buyerDetailsValid(buyer: { name?: string | null; email?: string | null } | null | undefined): boolean {
  if (!buyer) return false;
  const name = (buyer.name ?? '').trim();
  const email = (buyer.email ?? '').trim();
  if (name.length < 2 || name.length > 120) return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export type CartAction =
  | { type: 'START_NEW_ENTRY'; skipToStep?: WizardStep; entryType?: EntryType }
  | { type: 'SET_ENTRY_TYPE'; entryType: EntryType }
  | { type: 'SET_DOG'; dogId: string; dogName: string; breedName: string }
  | { type: 'SET_JH_DETAILS'; handlerName: string; handlerDob: string; handlerKcNumber?: string }
  | { type: 'SET_CLASSES'; classIds: string[]; classNames: string[]; totalFee: number; isNfc: boolean }
  | { type: 'SET_REGISTRATION_FLAGS'; entryId: string; naf: boolean; taf: boolean; cnaf: boolean; atcNumber: string }
  | { type: 'SET_DISCOUNT_GROUP'; discountGroupId: string | null }
  | { type: 'EDIT_ENTRY'; entryId: string }
  | { type: 'REMOVE_ENTRY'; entryId: string }
  | { type: 'SET_SUNDRY_ITEM'; item: CartSundryItem }
  | { type: 'REMOVE_SUNDRY_ITEM'; sundryItemId: string }
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_BUYER'; buyer: BuyerDetails | null }
  | { type: 'SET_LAST_CHECKOUT'; lastCheckout: LastCheckout | null }
  | { type: 'CHECKOUT_SUCCESS' }
  | { type: 'RESET' };

/**
 * Generate a cart-entry ID that is guaranteed unique within the *current*
 * cart by deriving it from the entries already present.
 *
 * This must NOT use a module-level counter. The cart persists to localStorage
 * and is restored by loadSavedState, but a module reset (mobile Safari evicting
 * a backgrounded tab, reopening the show, a hard reload) resets any module
 * counter back to its start. A restored cart would then hold `cart-1` while the
 * counter also handed out `cart-1` again — and the reducer's
 * `entries.map(e => e.id === activeEntryId ? ... : e)` updates EVERY entry
 * sharing that id, so SET_DOG/SET_CLASSES clobbered two cart rows at once. That
 * silently saved two different dogs under one dog_id (Mandy, 2026-06-01).
 * Deriving the next id from state is immune to module resets.
 */
function nextEntryId(entries: CartEntry[]): string {
  const max = entries.reduce((m, e) => {
    const match = /^cart-(\d+)$/.exec(e.id);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `cart-${max + 1}`;
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'START_NEW_ENTRY': {
      const id = nextEntryId(state.entries);
      return {
        ...state,
        activeEntryId: id,
        editingExisting: false,
        step: action.skipToStep ?? 'entry_type',
        entries: [
          ...state.entries,
          {
            id,
            entryType: action.entryType ?? 'standard',
            classIds: [],
            classNames: [],
            isNfc: false,
            totalFee: 0,
          },
        ],
      };
    }

    case 'SET_ENTRY_TYPE': {
      const nextStep: WizardStep =
        action.entryType === 'standard' ? 'select_dog' : 'junior_handler';
      // If there's no active entry to retype (a stale or cleared activeEntryId —
      // e.g. after a rehydrate to cart_review, a removed entry, or a browser
      // back), CREATE one. Otherwise this silently no-ops yet still advances the
      // step, so the user walks into class selection with no entry and the page
      // renders the wrong branch + every class (Mandy 2026-06-26).
      const hasActive = state.entries.some((e) => e.id === state.activeEntryId);
      if (!hasActive) {
        const id = nextEntryId(state.entries);
        return {
          ...state,
          activeEntryId: id,
          editingExisting: false,
          step: nextStep,
          entries: [
            ...state.entries,
            { id, entryType: action.entryType, classIds: [], classNames: [], isNfc: false, totalFee: 0 },
          ],
        };
      }
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === state.activeEntryId
            ? { ...e, entryType: action.entryType }
            : e
        ),
        step: nextStep,
      };
    }

    case 'SET_DOG': {
      // No active entry to attach the dog to — ignore rather than advancing to
      // class selection with no entry (which renders the wrong branch + every
      // class). Mandy 2026-06-26.
      if (!state.entries.some((e) => e.id === state.activeEntryId)) return state;
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === state.activeEntryId
            ? {
                ...e,
                dogId: action.dogId,
                dogName: action.dogName,
                breedName: action.breedName,
              }
            : e
        ),
        step: 'select_classes',
      };
    }

    case 'SET_JH_DETAILS': {
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === state.activeEntryId
            ? {
                ...e,
                handlerName: action.handlerName,
                handlerDob: action.handlerDob,
                handlerKcNumber: action.handlerKcNumber,
              }
            : e
        ),
        step: 'select_classes',
      };
    }

    case 'SET_CLASSES': {
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === state.activeEntryId
            ? {
                ...e,
                classIds: action.classIds,
                classNames: action.classNames,
                totalFee: action.totalFee,
                isNfc: action.isNfc,
              }
            : e
        ),
        step: 'cart_review',
      };
    }

    case 'SET_REGISTRATION_FLAGS': {
      // Targets a specific cart row by id (not activeEntryId) — these are set
      // on the cart-review screen, where several dogs are listed at once.
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.entryId
            ? { ...e, naf: action.naf, taf: action.taf, cnaf: action.cnaf, atcNumber: action.atcNumber }
            : e
        ),
      };
    }

    case 'SET_DISCOUNT_GROUP': {
      return { ...state, discountGroupId: action.discountGroupId };
    }

    case 'EDIT_ENTRY': {
      const entry = state.entries.find((e) => e.id === action.entryId);
      if (!entry) return state;
      return {
        ...state,
        activeEntryId: action.entryId,
        editingExisting: true,
        step: 'select_classes',
      };
    }

    case 'REMOVE_ENTRY': {
      const remaining = state.entries.filter((e) => e.id !== action.entryId);
      return {
        ...state,
        entries: remaining,
        activeEntryId:
          state.activeEntryId === action.entryId ? null : state.activeEntryId,
        step: remaining.length === 0 ? 'entry_type' : 'cart_review',
      };
    }

    case 'SET_SUNDRY_ITEM': {
      const existing = state.sundryItems.findIndex(
        (s) => s.sundryItemId === action.item.sundryItemId
      );
      if (existing >= 0) {
        return {
          ...state,
          sundryItems: state.sundryItems.map((s, i) =>
            i === existing ? action.item : s
          ),
        };
      }
      return {
        ...state,
        sundryItems: [...state.sundryItems, action.item],
      };
    }

    case 'REMOVE_SUNDRY_ITEM': {
      return {
        ...state,
        sundryItems: state.sundryItems.filter(
          (s) => s.sundryItemId !== action.sundryItemId
        ),
      };
    }

    case 'SET_STEP': {
      return { ...state, step: action.step };
    }

    case 'SET_BUYER': {
      return { ...state, buyer: action.buyer };
    }

    case 'SET_LAST_CHECKOUT': {
      return { ...state, lastCheckout: action.lastCheckout };
    }

    case 'CHECKOUT_SUCCESS': {
      // A completed order's discount group must never leak into whatever the
      // exhibitor does next in the same browser session (e.g. "Enter Another
      // Dog" straight after paying).
      // `buyer` stays in memory for the confirmation line; the stored cart is
      // removed at confirmation, and the paid order is no longer cancellable.
      return { ...state, step: 'confirmation', discountGroupId: null, lastCheckout: null };
    }

    case 'RESET': {
      return initialState;
    }

    default:
      return state;
  }
}

export const initialState: CartState = {
  entries: [],
  sundryItems: [],
  activeEntryId: null,
  step: 'entry_type',
  editingExisting: false,
  discountGroupId: null,
  buyer: null,
  lastCheckout: null,
};

/**
 * A discount-group id restored from localStorage (or carried across a
 * remount) may no longer be one of the show's CURRENT groups — a secretary
 * can delete a group after an exhibitor already ticked it and stashed their
 * cart. Sending a stale id to orders.checkout 400s the whole order, so once
 * the show's groups have actually loaded, drop anything that isn't among
 * them back to null (standard rate) rather than resubmit it blind.
 *
 * Returns the id unchanged while `discountGroups` hasn't loaded yet
 * (undefined) — there's nothing to validate against yet, so don't clear a
 * perfectly good selection on a hunch.
 */
export function validateDiscountGroupId(
  discountGroupId: string | null | undefined,
  discountGroups: { id: string }[] | undefined,
): string | null {
  if (!discountGroupId) return null;
  if (!discountGroups) return discountGroupId;
  return discountGroups.some((g) => g.id === discountGroupId) ? discountGroupId : null;
}

/** An entry is ready to be ordered once it has a class — or is NFC, which
 *  deliberately has none. ONE definition for "complete". */
export function isCompleteEntry(e: Pick<CartEntry, 'classIds' | 'isNfc'>): boolean {
  return e.classIds.length > 0 || e.isNfc;
}

/**
 * "Extras only" — buying a catalogue, parking pass etc. with NO dog (Mandy,
 * 15 Oct 2026). DERIVED from the cart, never stored as a flag: the review,
 * payment and confirmation screens are extras-only exactly when the cart has no
 * complete entry. On the dog steps (type, dog, handler, classes) the exhibitor
 * is by definition on the dog path. ONE owner for this rule.
 */
export function isExtrasOnlyCart(
  entries: Pick<CartEntry, 'classIds' | 'isNfc'>[],
  step: WizardStep,
): boolean {
  if (step !== 'cart_review' && step !== 'payment' && step !== 'confirmation') return false;
  return !entries.some(isCompleteEntry);
}

/**
 * How many cards step 1 ("What type of entry?") offers: Enter a Dog is always
 * there, Junior Handler when the show has JH classes, and "Just extras, no dog"
 * when the show sells extras and entries are open. The step is skipped ONLY when
 * the answer is exactly one — it used to be skipped whenever there were no JH
 * classes, which would now hide the extras card.
 */
export function entryTypeOptionCount(opts: {
  hasJhClasses: boolean;
  extrasAvailable: boolean;
}): number {
  return 1 + (opts.hasJhClasses ? 1 : 0) + (opts.extrasAvailable ? 1 : 0);
}

/**
 * Signed out, should the wizard send them to sign in? ONE owner for the rule
 * (extras without a dog, slice 2): a signed-out visitor can only buy extras, so
 * any dog step, a dog or handler in the restored cart, or a show with no extras
 * on sale means "sign in" - exactly what the page did for everyone before.
 * Never true while the session is loading (`signedOut` is false then).
 */
export function signedOutNeedsSignIn(opts: {
  signedOut: boolean;
  step: WizardStep;
  entries: Pick<CartEntry, 'classIds' | 'isNfc'>[];
  showLoaded: boolean;
  extrasLoaded: boolean;
  extrasAvailable: boolean;
}): boolean {
  if (!opts.signedOut) return false;
  if (opts.step === 'select_dog' || opts.step === 'junior_handler' || opts.step === 'select_classes') return true;
  if (opts.entries.some(isCompleteEntry)) return true;
  // The extras list is only fetched on these two steps; on payment and
  // confirmation a disabled query would read as "none on sale".
  if (opts.step === 'entry_type' || opts.step === 'cart_review') {
    return opts.showLoaded && opts.extrasLoaded && !opts.extrasAvailable;
  }
  return false;
}

function getStorageKey(showId: string) {
  return `remi-entry-cart-${showId}`;
}

/**
 * localStorage key holding the in-flight payment snapshot (the Stripe
 * PaymentIntent client secret + the amounts the payment screen shows) while an
 * exhibitor is on the payment step. It lets a payment-step reload restore the
 * exact screen and reuse the SAME PaymentIntent — so a card can never be charged
 * twice — rather than dropping them a step back to start a fresh payment.
 */
export function getPaymentKey(showId: string) {
  return `remi-entry-pay-${showId}`;
}

export type RestorePaymentAction = 'confirmation' | 'review' | 'stay';

/**
 * Decide what to do when a payment-step reload restores a saved payment
 * snapshot and we then ask Stripe for the authoritative status of that
 * snapshot's PaymentIntent.
 *
 * - succeeded / processing → the charge landed in the lost moment; jump to
 *   confirmation (the webhook confirms the order server-side).
 * - canceled, or NO PaymentIntent retrievable → the snapshot is DEAD. Restoring
 *   the payment screen on a canceled PI mounts an inert Stripe PaymentElement
 *   the exhibitor can never complete, and a payment screen that keeps coming
 *   back broken is what trips iOS Safari's "A problem repeatedly occurred"
 *   watchdog. Send them back to cart review so re-entering payment mints a FRESH
 *   PaymentIntent. (April Shaikh, BAGSD 2026-06-17 — 19 abandoned attempts left
 *   a canceled-PI snapshot that looped the crash.)
 * - anything still payable (requires_payment_method / requires_action /
 *   requires_confirmation) → stay on the restored payment screen and carry on
 *   with the same PaymentIntent.
 */
export function restoreActionForStatus(
  status: string | null | undefined
): RestorePaymentAction {
  if (status === 'succeeded' || status === 'processing') return 'confirmation';
  if (!status || status === 'canceled') return 'review';
  // requires_payment_method / requires_action / requires_confirmation — and any
  // unrecognized status — default to 'stay' (assumed still payable). Keeping a
  // possibly-live PI on screen is safer than discarding it.
  return 'stay';
}

export function loadSavedState(showId: string): CartState {
  if (typeof window === 'undefined') return initialState;

  // Are we returning from a Stripe redirect (3-D Secure / bank authentication)?
  // Stripe appends `redirect_status` + `payment_intent_client_secret` to the
  // return_url (this enter page). The old code unconditionally reset a
  // step:'payment' cart to initialState below, which the page's auto-start
  // effect then turned into the "add a dog" step — so any exhibitor whose bank
  // enforces 3DS got bounced out of checkout and could never pay (Mandy
  // 2026-06-17, April Shaikh). Most £18 cards skip 3DS via the low-value SCA
  // exemption, which is why it slipped through. On a SUCCESSFUL return we show
  // the confirmation (the webhook confirms the order server-side); on a FAILED
  // one we keep their cart so they can retry — but we NEVER drop them to the
  // add-a-dog step.
  const params = new URLSearchParams(window.location.search);
  const returningFromStripe = params.has('payment_intent_client_secret');
  const redirectStatus = params.get('redirect_status');

  try {
    const saved = localStorage.getItem(getStorageKey(showId));
    const parsed = saved ? (JSON.parse(saved) as CartState) : null;
    const completeEntries = (parsed?.entries ?? []).filter(
      (e) => e.classIds.length > 0 || e.isNfc
    );

    // A cart of extras with NO dog is a real order (Mandy, 15 Oct 2026), so
    // "has something to restore" means entries OR extras — otherwise a reload
    // or a 3-D Secure return would throw an extras-only cart away.
    const hasContent = completeEntries.length > 0 || (parsed?.sundryItems ?? []).length > 0;

    if (returningFromStripe) {
      if (!parsed || !hasContent) return initialState;
      const step: WizardStep =
        redirectStatus === 'succeeded' ? 'confirmation' : 'cart_review';
      if (step === 'confirmation') localStorage.removeItem(getStorageKey(showId));
      return {
        ...parsed,
        entries: completeEntries,
        step,
        activeEntryId: null,
        editingExisting: false,
        buyer: parsed.buyer ?? null,
        // A paid order can't be cancelled; a failed return keeps its proof.
        lastCheckout: step === 'confirmation' ? null : (parsed.lastCheckout ?? null),
      };
    }

    if (!parsed) return initialState;
    // A stale 'confirmation' step means they already finished — start fresh.
    if (parsed.step === 'confirmation') return initialState;
    if (!hasContent) return initialState;

    // A 'payment' step reloaded WITHOUT Stripe redirect params is the real-world
    // bounce: mobile Safari evicts the backgrounded tab during a 3-D Secure
    // challenge and reloads it with a bare URL. The old code reset the cart and
    // the page's auto-start effect dumped the exhibitor on the "add a dog" step
    // — any 3DS-card user could never pay (Mandy 2026-06-17, April Shaikh; same
    // on her iPad AND iPhone 14). We put them back exactly where they were: if
    // we still hold the payment snapshot (PaymentIntent + amounts, persisted on
    // entering payment) the page rehydrates and we restore the PAYMENT screen so
    // they carry straight on; otherwise we fall back to cart review so they can
    // re-enter payment safely. Either way the page's retrievePaymentIntent check
    // promotes them to confirmation if that payment had in fact already
    // succeeded — and because the restored screen reuses the SAME PaymentIntent,
    // a card can never be charged twice.
    const hasPaymentSnapshot = !!localStorage.getItem(getPaymentKey(showId));
    const step: WizardStep =
      parsed.step === 'payment' && hasPaymentSnapshot ? 'payment' : 'cart_review';
    return {
      ...parsed,
      entries: completeEntries,
      step,
      activeEntryId: null,
      editingExisting: false,
      buyer: parsed.buyer ?? null,
      lastCheckout: parsed.lastCheckout ?? null,
    };
  } catch {
    return initialState;
  }
}

export function useEntryCart(showId?: string) {
  const [state, dispatch] = useReducer(
    cartReducer,
    initialState,
    () => (showId ? loadSavedState(showId) : initialState)
  );

  // Persist cart state to sessionStorage so it survives navigation (e.g. adding a new dog)
  useEffect(() => {
    if (!showId) return;
    if (state.step === 'confirmation') {
      localStorage.removeItem(getStorageKey(showId));
    } else if (state.entries.length > 0 || state.sundryItems.length > 0) {
      localStorage.setItem(getStorageKey(showId), JSON.stringify(state));
    }
  }, [showId, state]);

  const activeEntry = state.entries.find(
    (e) => e.id === state.activeEntryId
  );

  const entriesTotal = state.entries.reduce(
    (sum, e) => sum + e.totalFee,
    0
  );

  const sundryTotal = state.sundryItems.reduce(
    (sum, s) => sum + s.unitPrice * s.quantity,
    0
  );

  const grandTotal = entriesTotal + sundryTotal;

  const startNewEntry = useCallback(() => dispatch({ type: 'START_NEW_ENTRY' }), []);
  const addAnotherDog = useCallback(
    () => dispatch({ type: 'START_NEW_ENTRY', skipToStep: 'select_dog', entryType: 'standard' }),
    []
  );
  const addJuniorHandler = useCallback(
    () => dispatch({ type: 'START_NEW_ENTRY', skipToStep: 'junior_handler', entryType: 'junior_handler' }),
    []
  );
  const setEntryType = useCallback(
    (entryType: EntryType) => dispatch({ type: 'SET_ENTRY_TYPE', entryType }),
    []
  );
  const setDog = useCallback(
    (dogId: string, dogName: string, breedName: string) =>
      dispatch({ type: 'SET_DOG', dogId, dogName, breedName }),
    []
  );
  const setJHDetails = useCallback(
    (handlerName: string, handlerDob: string, handlerKcNumber?: string) =>
      dispatch({ type: 'SET_JH_DETAILS', handlerName, handlerDob, handlerKcNumber }),
    []
  );
  const setClasses = useCallback(
    (classIds: string[], classNames: string[], totalFee: number, isNfc: boolean) =>
      dispatch({ type: 'SET_CLASSES', classIds, classNames, totalFee, isNfc }),
    []
  );
  const setRegistrationFlags = useCallback(
    (entryId: string, flags: { naf: boolean; taf: boolean; cnaf: boolean; atcNumber: string }) =>
      dispatch({ type: 'SET_REGISTRATION_FLAGS', entryId, ...flags }),
    []
  );
  const setDiscountGroup = useCallback(
    (discountGroupId: string | null) => dispatch({ type: 'SET_DISCOUNT_GROUP', discountGroupId }),
    []
  );
  const editEntry = useCallback(
    (entryId: string) => dispatch({ type: 'EDIT_ENTRY', entryId }),
    []
  );
  const removeEntry = useCallback(
    (entryId: string) => dispatch({ type: 'REMOVE_ENTRY', entryId }),
    []
  );
  const setStep = useCallback(
    (step: WizardStep) => dispatch({ type: 'SET_STEP', step }),
    []
  );
  const checkoutSuccess = useCallback(
    () => dispatch({ type: 'CHECKOUT_SUCCESS' }),
    []
  );
  const setSundryItem = useCallback(
    (item: CartSundryItem) => dispatch({ type: 'SET_SUNDRY_ITEM', item }),
    []
  );
  const removeSundryItem = useCallback(
    (sundryItemId: string) => dispatch({ type: 'REMOVE_SUNDRY_ITEM', sundryItemId }),
    []
  );
  const setBuyer = useCallback(
    (buyer: BuyerDetails | null) => dispatch({ type: 'SET_BUYER', buyer }),
    []
  );
  const setLastCheckout = useCallback(
    (lastCheckout: LastCheckout | null) => dispatch({ type: 'SET_LAST_CHECKOUT', lastCheckout }),
    []
  );
  const reset = useCallback(() => {
    if (showId) localStorage.removeItem(getStorageKey(showId));
    dispatch({ type: 'RESET' });
  }, [showId]);

  return {
    ...state,
    // Normalised to string | null — never undefined, even for a cart
    // persisted before this field existed (loadSavedState just spreads
    // whatever was saved). Overrides the `...state` spread above.
    discountGroupId: state.discountGroupId ?? null,
    buyer: state.buyer ?? null,
    lastCheckout: state.lastCheckout ?? null,
    activeEntry,
    entriesTotal,
    grandTotal,
    sundryTotal,
    startNewEntry,
    addAnotherDog,
    addJuniorHandler,
    setEntryType,
    setDog,
    setJHDetails,
    setClasses,
    setRegistrationFlags,
    setDiscountGroup,
    editEntry,
    removeEntry,
    setSundryItem,
    removeSundryItem,
    setStep,
    setBuyer,
    setLastCheckout,
    checkoutSuccess,
    reset,
  };
}
