import { describe, it, expect } from 'vitest';
import {
  cartReducer,
  initialState,
  type CartState,
} from '@/app/(shows)/shows/[id]/enter/use-entry-cart';

/**
 * Regression: two different dogs in one checkout were both saved under the
 * SAME dog_id (Mandy, South Western, 2026-06-01 — Hundark Christmas Spirit +
 * Rosebud Edie both recorded as Christmas Spirit, 63ms apart, same Open Bitch).
 *
 * Root cause was client-side. Cart entry IDs were handed out by a module-level
 * `nextId` counter starting at 1, but the cart persists to localStorage and is
 * restored on load. A module reset (mobile Safari evicting a backgrounded tab,
 * reopening the show, a hard reload) reset the counter while the restored cart
 * still held an entry id `cart-1`. The next "add another dog" regenerated
 * `cart-1`, and the reducer's `entries.map(e => e.id === activeEntryId ...)`
 * updated EVERY entry sharing that id — so SET_DOG / SET_CLASSES clobbered the
 * first dog with the second. The server faithfully wrote two entries with the
 * same dog_id.
 *
 * Fix: derive the next id from the entries already in state, which is immune to
 * module resets. These tests reproduce the post-reload scenario directly
 * (constructing the restored state, no localStorage needed).
 */
describe('entry cart reducer — duplicate-dog-id collision', () => {
  // Mimics loadSavedState's output after a reload: entries restored with their
  // previously-assigned ids, step back at cart_review, no active entry.
  function restoredCartWithOneDog(): CartState {
    return {
      ...initialState,
      step: 'cart_review',
      activeEntryId: null,
      entries: [
        {
          id: 'cart-1',
          entryType: 'standard',
          dogId: 'dog-edie',
          dogName: 'Rosebud Edie of Hundark',
          breedName: 'German Shepherd Dog',
          classIds: ['cls-limit-bitch'],
          classNames: ['Limit Bitch'],
          isNfc: false,
          totalFee: 4000,
        },
      ],
    };
  }

  it('adding a second dog after a reload does not clobber the first', () => {
    let s = restoredCartWithOneDog();

    // User taps "add another dog" — START_NEW_ENTRY must mint a NEW id that
    // does not collide with the restored `cart-1`.
    s = cartReducer(s, {
      type: 'START_NEW_ENTRY',
      skipToStep: 'select_dog',
      entryType: 'standard',
    });
    s = cartReducer(s, {
      type: 'SET_DOG',
      dogId: 'dog-spirit',
      dogName: 'Hundark Christmas Spirit',
      breedName: 'German Shepherd Dog',
    });
    s = cartReducer(s, {
      type: 'SET_CLASSES',
      classIds: ['cls-open-bitch'],
      classNames: ['Open Bitch'],
      totalFee: 4000,
      isNfc: false,
    });

    // Two distinct cart entries, two distinct dogs.
    expect(s.entries).toHaveLength(2);
    expect(new Set(s.entries.map((e) => e.id)).size).toBe(2);

    const first = s.entries[0]!;
    const second = s.entries[1]!;
    expect(first.dogId).toBe('dog-edie'); // first NOT overwritten
    expect(first.classNames).toEqual(['Limit Bitch']); // first's classes intact
    expect(second.dogId).toBe('dog-spirit');
    expect(second.classNames).toEqual(['Open Bitch']);

    // The payload the page sends to orders.checkout — must carry both dogs.
    const dogIds = s.entries.map((e) => e.dogId);
    expect(new Set(dogIds).size).toBe(2);
  });

  it('nextEntryId never reuses an id already present in the restored cart', () => {
    // Two dogs already restored (cart-1, cart-2). The next START_NEW_ENTRY must
    // not produce cart-1 or cart-2 no matter the in-memory module state.
    let s: CartState = {
      ...initialState,
      step: 'cart_review',
      entries: [
        {
          id: 'cart-1',
          entryType: 'standard',
          dogId: 'dog-a',
          classIds: ['c1'],
          classNames: ['A'],
          isNfc: false,
          totalFee: 100,
        },
        {
          id: 'cart-2',
          entryType: 'standard',
          dogId: 'dog-b',
          classIds: ['c2'],
          classNames: ['B'],
          isNfc: false,
          totalFee: 100,
        },
      ],
    };

    s = cartReducer(s, { type: 'START_NEW_ENTRY', skipToStep: 'select_dog' });
    const ids = s.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.activeEntryId).not.toBe('cart-1');
    expect(s.activeEntryId).not.toBe('cart-2');
  });

  it('normal sequential add (no reload) still gives unique ids', () => {
    let s = initialState;
    s = cartReducer(s, { type: 'START_NEW_ENTRY', skipToStep: 'select_dog' });
    s = cartReducer(s, {
      type: 'SET_DOG',
      dogId: 'dog-a',
      dogName: 'A',
      breedName: 'GSD',
    });
    s = cartReducer(s, {
      type: 'SET_CLASSES',
      classIds: ['c1'],
      classNames: ['Open'],
      totalFee: 100,
      isNfc: false,
    });
    s = cartReducer(s, {
      type: 'START_NEW_ENTRY',
      skipToStep: 'select_dog',
    });
    s = cartReducer(s, {
      type: 'SET_DOG',
      dogId: 'dog-b',
      dogName: 'B',
      breedName: 'GSD',
    });

    expect(s.entries).toHaveLength(2);
    expect(new Set(s.entries.map((e) => e.id)).size).toBe(2);
    expect(s.entries[0]!.dogId).toBe('dog-a');
    expect(s.entries[1]!.dogId).toBe('dog-b');
  });
});
