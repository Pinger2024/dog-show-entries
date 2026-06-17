import { describe, it, expect } from 'vitest';
import { loadSavedState, getPaymentKey, restoreActionForStatus, type CartState } from './use-entry-cart';

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
