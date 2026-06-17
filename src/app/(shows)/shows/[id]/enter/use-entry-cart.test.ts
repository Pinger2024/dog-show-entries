import { describe, it, expect } from 'vitest';
import { loadSavedState, type CartState } from './use-entry-cart';

const KEY = 'remi-entry-cart-SHOW';

function stub(search: string, saved: CartState | null) {
  const store: Record<string, string> = {};
  if (saved) store[KEY] = JSON.stringify(saved);
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
// returning from a Stripe bank-auth redirect used to reset the cart, dropping the
// exhibitor onto the "add a dog" step so any 3DS-card user could never pay.
describe('loadSavedState — Stripe 3-D Secure redirect return', () => {
  it('3DS SUCCESS → confirmation with entries kept (never bounced to add-a-dog)', () => {
    stub('?payment_intent=pi_x&payment_intent_client_secret=pi_x_secret&redirect_status=succeeded', paymentCart);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('confirmation');
    expect(s.entries).toHaveLength(1);
  });

  it('3DS FAILED → back to cart_review to retry, NOT the dog/entry step', () => {
    stub('?payment_intent=pi_x&payment_intent_client_secret=pi_x_secret&redirect_status=failed', paymentCart);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('cart_review');
    expect(s.entries).toHaveLength(1);
    expect(['entry_type', 'select_dog']).not.toContain(s.step);
  });

  it('NO redirect, stale payment step → reset to start (existing behaviour preserved)', () => {
    stub('', paymentCart);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('entry_type');
    expect(s.entries).toHaveLength(0);
  });

  it('redirect return but no saved cart → safe initial state, no crash', () => {
    stub('?payment_intent_client_secret=pi_x_secret&redirect_status=succeeded', null);
    const s = loadSavedState('SHOW');
    expect(s.step).toBe('entry_type');
  });
});
