import { describe, it, expect } from 'vitest';
import {
  loadSavedState,
  getPaymentKey,
  restoreActionForStatus,
  cartReducer,
  computeClassSelectionTotal,
  validateDiscountGroupId,
  type CartState,
} from './use-entry-cart';

const KEY = 'remi-entry-cart-SHOW';
const PAY_KEY = getPaymentKey('SHOW');

// `payment` seeds the persisted payment snapshot (as the page does on entering
// the payment step) so we can exercise the "restore the payment screen" path.
function stub(search: string, saved: CartState | null, payment = false) {
  const store: Record<string, string> = {};
  if (saved) store[KEY] = JSON.stringify(saved);
  if (payment) store[PAY_KEY] = JSON.stringify({ clientSecret: 'pi_x_secret', paymentAmount: 1800 });
  (globalThis as unknown as { window: unknown }).window = {
    location: { search, pathname: '/shows/SHOW/enter' },
    history: { replaceState() {} },
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
}

const paymentCart: CartState = {
  entries: [{
    id: 'cart-1', entryType: 'standard', dogId: 'd1', dogName: 'Rex', breedName: 'GSD',
    classIds: ['c1'], classNames: ['Puppy'], isNfc: false, totalFee: 1800,
  }],
  sundryItems: [], activeEntryId: 'cart-1', step: 'payment', editingExisting: false,
};

// Regression for the 3-D Secure checkout bounce (Mandy / April Shaikh, 2026-06-17):
// any exhibitor whose bank enforced 3DS got dropped onto the "add a dog" step and
// could never pay. Two ways back into this page from the payment step:
//   1. a Stripe *redirect* return (carries payment_intent params), or
//   2. a *param-less* reload — mobile Safari evicts the backgrounded tab during
//      the 3DS challenge and reloads with a bare URL. THIS was the real cause
//      (it reproduced on April's iPad AND iPhone 14). The old code reset a
//      payment-step cart to initialState on that bare reload, and the page's
//      auto-start effect turned the empty cart into "add a dog".
describe('loadSavedState — Stripe 3-D Secure redirect return', () => {
  it('3DS SUCCESS redirect → confirmation with entries kept (never bounced to add-a-dog)', () => {
    stub('?payment_intent=pi_x&payment_intent_client_secret=pi_x_secret&redirect_status=succeeded', paymentCart);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('confirmation');
    expect(s.entries).toHaveLength(1);
  });

  it('3DS FAILED redirect → back to cart_review to retry, NOT the dog/entry step', () => {
    stub('?payment_intent=pi_x&payment_intent_client_secret=pi_x_secret&redirect_status=failed', paymentCart);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('cart_review');
    expect(s.entries).toHaveLength(1);
    expect(['entry_type', 'select_dog']).not.toContain(s.step);
  });

  it('redirect return but no saved cart → safe initial state, no crash', () => {
    stub('?payment_intent_client_secret=pi_x_secret&redirect_status=succeeded', null);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('entry_type');
  });
});

// THE bug that bounced April: a param-less reload of the payment step. This is
// the exact case the old code got wrong — it must put her back where she was
// (the payment screen) and must NEVER drop her on the add-a-dog / entry-type step.
describe('loadSavedState — payment-step reload WITHOUT Stripe params (mobile Safari)', () => {
  it('with the payment snapshot → restores the PAYMENT screen (back where she was)', () => {
    stub('', paymentCart, /* payment snapshot present */ true);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('payment');
    expect(s.entries).toHaveLength(1);
    // The bounce was step → entry_type with the cart wiped. Guard both.
    expect(s.step).not.toBe('entry_type');
    expect(s.entries.length).toBeGreaterThan(0);
  });

  it('snapshot lost (e.g. private mode) → falls back to cart_review, never add-a-dog', () => {
    stub('', paymentCart, /* no payment snapshot */ false);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('cart_review');
    expect(s.entries).toHaveLength(1);
    expect(s.step).not.toBe('entry_type');
  });

  it('a half-built entry (no classes) on a bare reload still resets cleanly', () => {
    const halfBuilt: CartState = {
      ...paymentCart,
      entries: [{ ...paymentCart.entries[0]!, classIds: [], isNfc: false }],
    };
    stub('', halfBuilt, true);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('entry_type');
    expect(s.entries).toHaveLength(0);
  });
});

// THE bug behind April Shaikh's "A problem repeatedly occurred" crash loop
// (BAGSD, 2026-06-17). loadSavedState restores the payment screen from a saved
// snapshot, then the page asks Stripe for the snapshot PaymentIntent's status.
// April had made 19 abandoned attempts; each newer order CANCELLED the previous
// PaymentIntent, so her saved snapshot pointed at a CANCELED PI. The old restore
// effect only handled succeeded/processing and otherwise LEFT HER ON 'payment' —
// re-mounting an inert Stripe PaymentElement on a dead PI every visit, the
// degraded payment screen that tripped Safari's crash watchdog. The fix: a
// canceled (or unretrievable) PI must drop the stale snapshot and fall back to
// cart review so re-entering payment mints a fresh PaymentIntent.
describe('restoreActionForStatus — canceled-PI crash loop (April/BAGSD)', () => {
  it('CANCELED PaymentIntent → review (NOT stay on the dead payment screen)', () => {
    // The reproduction: the old code had no canceled branch, so a canceled PI
    // kept step:'payment' and re-mounted a broken PaymentElement → crash loop.
    expect(restoreActionForStatus('canceled')).toBe('review');
    expect(restoreActionForStatus('canceled')).not.toBe('stay');
  });

  it('no PaymentIntent retrievable (null/undefined) → review, never a broken payment screen', () => {
    expect(restoreActionForStatus(undefined)).toBe('review');
    expect(restoreActionForStatus(null)).toBe('review');
  });

  it('already paid in the lost moment → confirmation (succeeded / processing)', () => {
    expect(restoreActionForStatus('succeeded')).toBe('confirmation');
    expect(restoreActionForStatus('processing')).toBe('confirmation');
  });

  it('still-payable PI → stay on the restored payment screen (same PI, no double charge)', () => {
    expect(restoreActionForStatus('requires_payment_method')).toBe('stay');
    expect(restoreActionForStatus('requires_action')).toBe('stay');
    expect(restoreActionForStatus('requires_confirmation')).toBe('stay');
  });
});

// A standard DOG entry was rendering the Junior Handler branch with EVERY class
// (Mandy 2026-06-26). Root cause: SET_ENTRY_TYPE / SET_DOG advanced the wizard
// step even when `activeEntryId` matched no entry (a stale id after a
// rehydrate-to-cart_review, a removed entry, or a browser back) — so the user
// reached class selection with no active entry, no selected dog, and therefore
// no sex/coat filter. The reducer must never leave you on a per-entry step
// without an active entry.
describe('cartReducer — never strand a per-entry step without an active entry', () => {
  const base: CartState = {
    entries: [], sundryItems: [], activeEntryId: null, step: 'entry_type', editingExisting: false,
  };

  it('SET_ENTRY_TYPE with no active entry creates one (instead of silently no-opping)', () => {
    const s = cartReducer(base, { type: 'SET_ENTRY_TYPE', entryType: 'standard' });
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].entryType).toBe('standard');
    expect(s.activeEntryId).toBe(s.entries[0].id);
    expect(s.step).toBe('select_dog');
  });

  it('SET_ENTRY_TYPE with a stale activeEntryId creates a fresh active entry of the chosen type', () => {
    const stale: CartState = {
      ...base,
      entries: [{ id: 'old', entryType: 'standard', classIds: ['c1'], classNames: ['Puppy'], isNfc: false, totalFee: 1 }],
      activeEntryId: null,
    };
    const s = cartReducer(stale, { type: 'SET_ENTRY_TYPE', entryType: 'junior_handler' });
    expect(s.entries).toHaveLength(2);
    expect(s.activeEntryId).not.toBeNull();
    expect(s.entries.find((e) => e.id === s.activeEntryId)?.entryType).toBe('junior_handler');
    expect(s.step).toBe('junior_handler');
  });

  it('SET_ENTRY_TYPE retypes the existing active entry when present', () => {
    const withActive: CartState = {
      ...base,
      entries: [{ id: 'cart-1', entryType: 'junior_handler', classIds: [], classNames: [], isNfc: false, totalFee: 0 }],
      activeEntryId: 'cart-1',
    };
    const s = cartReducer(withActive, { type: 'SET_ENTRY_TYPE', entryType: 'standard' });
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].entryType).toBe('standard');
    expect(s.step).toBe('select_dog');
  });

  it('SET_DOG with no active entry is ignored (does not advance to class selection)', () => {
    const s = cartReducer({ ...base, step: 'select_dog' }, { type: 'SET_DOG', dogId: 'd1', dogName: 'Rex', breedName: 'GSD' });
    expect(s.step).toBe('select_dog');
    expect(s.entries).toHaveLength(0);
  });
});

// Mandy 2026-07-21 (screenshots): a dog entered in a SPECIAL-only class was
// shown the normal £20 first-class tier fee on screen instead of the special
// class's own £3 fee — in both the class-picker running total AND the dog's
// card in the entry cart. Checkout itself was always correct (computeOrderFees
// server-side already knew about specialClassFees from 3d1f4e5); this was a
// client DISPLAY bug because the running total was hand-rolled as
// `first + subsequent * (count - 1)` and never learned about specials.
// computeClassSelectionTotal fixes it by routing through computeOrderFees
// instead — these tests fail against the old hand-rolled formula and pass
// against the fix.
describe('computeClassSelectionTotal — Special Award Classes priced at their own fee, not the tier', () => {
  const FIRST = 2000; // £20 members'/standard first-class fee
  const SUBSEQUENT = 500; // £5 subsequent-class fee
  const SPECIAL = 300; // £3 Special Award Class fee

  it('a dog entered ONLY in a special class is charged just the special fee, not the £20 tier', () => {
    const total = computeClassSelectionTotal(
      [{ isSpecial: true, entryFee: SPECIAL }],
      FIRST,
      SUBSEQUENT,
    );
    expect(total).toBe(SPECIAL);
    expect(total).not.toBe(FIRST);
  });

  it('multiple special classes on one dog sum their own fees, never the tier', () => {
    const total = computeClassSelectionTotal(
      [
        { isSpecial: true, entryFee: SPECIAL },
        { isSpecial: true, entryFee: 500 },
      ],
      FIRST,
      SUBSEQUENT,
    );
    expect(total).toBe(SPECIAL + 500);
  });

  it('one normal class + one special: normal priced at the first-class tier, special adds its own fee', () => {
    const total = computeClassSelectionTotal(
      [
        { isSpecial: false, entryFee: FIRST },
        { isSpecial: true, entryFee: SPECIAL },
      ],
      FIRST,
      SUBSEQUENT,
    );
    expect(total).toBe(FIRST + SPECIAL);
  });

  it('order does not matter: special first then normal still charges the normal class the first-class rate', () => {
    const total = computeClassSelectionTotal(
      [
        { isSpecial: true, entryFee: SPECIAL },
        { isSpecial: false, entryFee: FIRST },
      ],
      FIRST,
      SUBSEQUENT,
    );
    expect(total).toBe(FIRST + SPECIAL);
  });

  it('two normal classes + one special: first + subsequent tier plus the special fee', () => {
    const total = computeClassSelectionTotal(
      [
        { isSpecial: false, entryFee: FIRST },
        { isSpecial: false, entryFee: FIRST },
        { isSpecial: true, entryFee: SPECIAL },
      ],
      FIRST,
      SUBSEQUENT,
    );
    expect(total).toBe(FIRST + SUBSEQUENT + SPECIAL);
  });

  it('no special classes selected: unaffected, still first + subsequent * (count - 1)', () => {
    const total = computeClassSelectionTotal(
      [
        { isSpecial: false, entryFee: FIRST },
        { isSpecial: false, entryFee: FIRST },
      ],
      FIRST,
      SUBSEQUENT,
    );
    expect(total).toBe(FIRST + SUBSEQUENT);
  });

  it('no subsequentEntryFeePence configured falls back to the first-class rate for extra classes', () => {
    const total = computeClassSelectionTotal(
      [
        { isSpecial: false, entryFee: FIRST },
        { isSpecial: false, entryFee: FIRST },
      ],
      FIRST,
      null,
    );
    expect(total).toBe(FIRST + FIRST);
  });

  it('no classes selected → 0', () => {
    expect(computeClassSelectionTotal([], FIRST, SUBSEQUENT)).toBe(0);
  });
});

// Prod case, North Eastern GSD Club champ show (28 Aug, memory
// project_member_discount_lost_2026-08-28): Paula Ingham ticked "I am a
// Member" but paid £18 not £16 — her order has discount_group_id NULL while
// 5 other members' orders carry the group. Root cause: discountGroupId lived
// in PAGE state (useState), not the cart, so a reload, a Safari tab
// eviction, or the Add/Edit-dog detour (`/dogs/new?returnTo=…` unmounts the
// page) silently reset it to null while the cart itself survived (the cart
// persists to localStorage, page state does not). Moving it into the cart's
// own reducer state — persisted and restored exactly like every other cart
// field — closes that gap.
describe('cartReducer — SET_DISCOUNT_GROUP lives IN the cart, not page state', () => {
  const base: CartState = {
    entries: [], sundryItems: [], activeEntryId: null, step: 'cart_review', editingExisting: false,
  };

  it('SET_DISCOUNT_GROUP stores the chosen group id on cart state', () => {
    const s = cartReducer(base, { type: 'SET_DISCOUNT_GROUP', discountGroupId: 'grp-members' });
    expect(s.discountGroupId).toBe('grp-members');
  });

  it('SET_DISCOUNT_GROUP(null) clears it back to standard rate', () => {
    const withGroup: CartState = { ...base, discountGroupId: 'grp-members' };
    const s = cartReducer(withGroup, { type: 'SET_DISCOUNT_GROUP', discountGroupId: null });
    expect(s.discountGroupId).toBeNull();
  });

  it('does not disturb any other cart field', () => {
    const withEntry: CartState = {
      ...base,
      entries: [{ id: 'cart-1', entryType: 'standard', classIds: ['c1'], classNames: ['Puppy'], isNfc: false, totalFee: 1600 }],
      activeEntryId: 'cart-1',
    };
    const s = cartReducer(withEntry, { type: 'SET_DISCOUNT_GROUP', discountGroupId: 'grp-members' });
    expect(s.entries).toEqual(withEntry.entries);
    expect(s.activeEntryId).toBe('cart-1');
    expect(s.step).toBe('cart_review');
  });

  // "cleared wherever the cart resets on order success" (spec) — a leftover
  // discount group must never leak from one paid order into whatever the
  // exhibitor does next in the same browser session.
  it('CHECKOUT_SUCCESS clears the discount group along with completing the order', () => {
    const paidCart: CartState = {
      ...base,
      entries: [{ id: 'cart-1', entryType: 'standard', classIds: ['c1'], classNames: ['Puppy'], isNfc: false, totalFee: 1600 }],
      discountGroupId: 'grp-members',
    };
    const s = cartReducer(paidCart, { type: 'CHECKOUT_SUCCESS' });
    expect(s.step).toBe('confirmation');
    expect(s.discountGroupId).toBeNull();
  });

  it('RESET clears the discount group (initialState carries none)', () => {
    const withGroup: CartState = { ...base, discountGroupId: 'grp-members' };
    const s = cartReducer(withGroup, { type: 'RESET' });
    expect(s.discountGroupId).toBeNull();
  });
});

// The discount group must round-trip through localStorage exactly like the
// rest of the cart (use-entry-cart's persist effect saves the whole
// CartState). This is what makes it survive a reload, a Safari tab eviction,
// or a return from the Add/Edit-dog detour — the exact failure Paula hit.
describe('loadSavedState — the discount group survives a fresh hook mount from localStorage', () => {
  const memberCart: CartState = {
    entries: [{
      id: 'cart-1', entryType: 'standard', dogId: 'd1', dogName: 'Rex', breedName: 'GSD',
      classIds: ['c1'], classNames: ['Puppy'], isNfc: false, totalFee: 1600,
    }],
    sundryItems: [], activeEntryId: 'cart-1', step: 'cart_review', editingExisting: false,
    discountGroupId: 'grp-members',
  };

  it('a plain reload on cart_review restores the persisted discount group (a fresh hook mount)', () => {
    stub('', memberCart);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('cart_review');
    expect(s.discountGroupId).toBe('grp-members');
  });

  it('returning from the Stripe redirect with a failed 3DS attempt also keeps the discount group', () => {
    stub('?payment_intent=pi_x&payment_intent_client_secret=pi_x_secret&redirect_status=failed', {
      ...memberCart, step: 'payment',
    });
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('cart_review');
    expect(s.discountGroupId).toBe('grp-members');
  });

  it('an older cart saved before this field existed loads with no group, not a crash', () => {
    // Simulates a cart persisted by a pre-fix build of the app: no
    // discountGroupId key in the stored JSON at all.
    const legacy = { ...memberCart } as Partial<CartState>;
    delete legacy.discountGroupId;
    stub('', legacy as CartState);
    const s = loadSavedState('SHOW');
    expect(s.entries).toHaveLength(1);
    expect(s.discountGroupId ?? null).toBeNull();
  });

  // The checkout submit payload is built from the cart's discountGroupId
  // (`cart.discountGroupId ?? undefined`) rather than separate page state —
  // this proves that seam survives the exact remount Paula's browser did.
  it('the value the checkout payload would carry survives a remount unchanged', () => {
    stub('', memberCart);
    const s = loadSavedState('SHOW');
    const payloadDiscountGroupId = s.discountGroupId ?? undefined;
    expect(payloadDiscountGroupId).toBe('grp-members');
  });
});

// Restore-validation (spec step 2): a secretary can delete a discount group
// after an exhibitor has already ticked it and stashed the cart. Sending a
// stale id to orders.checkout 400s the whole order, so once the show's
// CURRENT groups have loaded, an id that isn't among them must fall back to
// null (standard rate) rather than be resubmitted blind.
describe('validateDiscountGroupId — a stored group the secretary deleted is dropped to null', () => {
  const currentGroups = [{ id: 'grp-members' }, { id: 'grp-pensioners' }];

  it('a stored id that is still a live group passes through unchanged', () => {
    expect(validateDiscountGroupId('grp-members', currentGroups)).toBe('grp-members');
  });

  it('a stored id no longer among the show\'s groups (secretary deleted it) → null', () => {
    expect(validateDiscountGroupId('grp-deleted', currentGroups)).toBeNull();
  });

  it('no group was ever selected → null, trivially', () => {
    expect(validateDiscountGroupId(null, currentGroups)).toBeNull();
  });

  it('the groups list has not loaded yet (undefined) → passes the id through, does not clear on a hunch', () => {
    expect(validateDiscountGroupId('grp-members', undefined)).toBe('grp-members');
  });

  it('the show has zero discount groups configured → any stored id is dropped', () => {
    expect(validateDiscountGroupId('grp-members', [])).toBeNull();
  });
});
