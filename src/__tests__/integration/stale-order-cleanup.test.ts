/**
 * Bug-hunt #3: when a new checkout cleans up a previous abandoned
 * (pending_payment) order, it must also cancel that order's open Stripe
 * PaymentIntent. Otherwise a checkout left open in another tab — or a
 * delayed/async payment method — can still complete, charging the customer for
 * an order we've already cancelled (charged with no entry).
 */
import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { orders } from '@/server/db/schema';
import { cancelPaymentIntent } from '@/server/services/stripe';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';

describe('stale checkout cleanup (bug-hunt #3)', () => {
  it('cancels the abandoned order Stripe PaymentIntent on the next checkout', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000,
      subsequentEntryFee: 1000,
    });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 });
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'stale-cleanup@test.local' });

    // Seed an abandoned checkout: a pending_payment order with an open PI.
    const [staleOrder] = await testDb
      .insert(orders)
      .values({
        showId: show.id,
        exhibitorId: exhibitor.id,
        status: 'pending_payment',
        totalAmount: 2000,
        stripePaymentIntentId: 'pi_stale_abandoned_123',
      })
      .returning();

    vi.mocked(cancelPaymentIntent).mockClear();

    // A fresh checkout for the same show/exhibitor triggers the stale cleanup.
    const newDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: newDog.id, classIds: [showClass.id], isNfc: false }],
    });

    // The abandoned PI is cancelled and the stale order marked cancelled — so
    // the customer can't be charged for an order that no longer exists.
    expect(vi.mocked(cancelPaymentIntent)).toHaveBeenCalledWith('pi_stale_abandoned_123');
    const after = await testDb.query.orders.findFirst({ where: eq(orders.id, staleOrder!.id) });
    expect(after?.status).toBe('cancelled');
  });
});
