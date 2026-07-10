import { useReducer, useCallback, useEffect } from 'react';

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
}

export type CartAction =
  | { type: 'START_NEW_ENTRY'; skipToStep?: WizardStep; entryType?: EntryType }
  | { type: 'SET_ENTRY_TYPE'; entryType: EntryType }
  | { type: 'SET_DOG'; dogId: string; dogName: string; breedName: string }
  | { type: 'SET_JH_DETAILS'; handlerName: string; handlerDob: string; handlerKcNumber?: string }
  | { type: 'SET_CLASSES'; classIds: string[]; classNames: string[]; totalFee: number; isNfc: boolean }
  | { type: 'EDIT_ENTRY'; entryId: string }
  | { type: 'REMOVE_ENTRY'; entryId: string }
  | { type: 'SET_SUNDRY_ITEM'; item: CartSundryItem }
  | { type: 'REMOVE_SUNDRY_ITEM'; sundryItemId: string }
  | { type: 'SET_STEP'; step: WizardStep }
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

    case 'CHECKOUT_SUCCESS': {
      return { ...state, step: 'confirmation' };
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
};

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

    if (returningFromStripe) {
      if (!parsed || completeEntries.length === 0) return initialState;
      const step: WizardStep =
        redirectStatus === 'succeeded' ? 'confirmation' : 'cart_review';
      if (step === 'confirmation') localStorage.removeItem(getStorageKey(showId));
      return { ...parsed, entries: completeEntries, step, activeEntryId: null, editingExisting: false };
    }

    if (!parsed) return initialState;
    // A stale 'confirmation' step means they already finished — start fresh.
    if (parsed.step === 'confirmation') return initialState;
    if (completeEntries.length === 0) return initialState;

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
  const reset = useCallback(() => {
    if (showId) localStorage.removeItem(getStorageKey(showId));
    dispatch({ type: 'RESET' });
  }, [showId]);

  return {
    ...state,
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
    editEntry,
    removeEntry,
    setSundryItem,
    removeSundryItem,
    setStep,
    checkoutSuccess,
    reset,
  };
}
