import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as stripeService from '@/server/services/stripe';
import { entries, entryClasses, payments } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
} from '../helpers/factories';

/** Build the minimum world an exhibitor needs to enter a show: open show + class + their dog. */
async function entryReadyShow(opts: { entryFee?: number } = {}) {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    entryCloseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  const showClass = await makeShowClass({
    showId: show.id,
    breedId: breed.id,
    entryFee: opts.entryFee ?? 700,
  });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  return { exhibitor, org, show, showClass, dog };
}

describe('payments.createIntent', () => {
  it('creates a pending entry, entry_class, payment row and Stripe intent', async () => {
    const { exhibitor, show, showClass, dog } = await entryReadyShow({ entryFee: 1200 });
    const caller = createTestCaller(exhibitor);
    vi.mocked(stripeService.createPaymentIntent).mockClear();

    const res = await caller.payments.createIntent({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
    });

    expect(res.amount).toBe(1200);
    expect(res.clientSecret).toMatch(/^pi_test_.*_secret_/);
    expect(res.entryId).toBeTruthy();

    const entry = await testDb.query.entries.findFirst({
      where: eq(entries.id, res.entryId),
    });
    expect(entry?.status).toBe('pending');
    expect(entry?.totalFee).toBe(1200);
    expect(entry?.paymentIntentId).toMatch(/^pi_test_/);

    const ec = await testDb.query.entryClasses.findFirst({
      where: eq(entryClasses.entryId, res.entryId),
    });
    expect(ec?.showClassId).toBe(showClass.id);
    expect(ec?.fee).toBe(1200);

    const payment = await testDb.query.payments.findFirst({
      where: eq(payments.entryId, res.entryId),
    });
    expect(payment?.status).toBe('pending');
    // payment.amount is the GROSS the exhibitor is charged (subtotal +
    // £1 + 1% handling fee). 1200 + (100 + round(1200 * 0.01)) = 1312.
    expect(payment?.amount).toBe(1312);
    expect(res.platformFeePence).toBe(112);
    expect(res.grossAmount).toBe(1312);

    // Platform-mode PaymentIntent — Remi is merchant of record, money
    // lands in Remi's Stripe balance, BACS'd to the club post-show.
    expect(vi.mocked(stripeService.createPaymentIntent)).toHaveBeenCalledWith(
      1312,
      expect.objectContaining({
        showId: show.id,
        dogId: dog.id,
        exhibitorId: exhibitor.id,
        entryId: res.entryId,
        platformFeePence: '112',
        subtotalPence: '1200',
      }),
    );
  });

  it('sums fees across multiple classes', async () => {
    const { exhibitor, show, dog } = await entryReadyShow({ entryFee: 500 });
    const c2 = await makeShowClass({ showId: show.id, entryFee: 500 });
    const c3 = await makeShowClass({ showId: show.id, entryFee: 800 });
    const caller = createTestCaller(exhibitor);

    const res = await caller.payments.createIntent({
      showId: show.id,
      dogId: dog.id,
      classIds: [c2.id, c3.id],
    });

    expect(res.amount).toBe(1300);
  });

  it('rejects when caller does not own the dog', async () => {
    const { show, showClass, dog } = await entryReadyShow();
    const otherUser = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(otherUser);

    await expect(
      caller.payments.createIntent({
        showId: show.id,
        dogId: dog.id,
        classIds: [showClass.id],
      }),
    ).rejects.toThrow(/do not own/);
  });

  it('rejects when show is not in entries_open status', async () => {
    const { exhibitor, dog, showClass } = await entryReadyShow();
    // Drop entries — make a show in draft status
    const org = await makeOrg();
    const draftShow = await makeShow({ organisationId: org.id, status: 'draft' });
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.payments.createIntent({
        showId: draftShow.id,
        dogId: dog.id,
        classIds: [showClass.id], // doesn't matter, fails earlier
      }),
    ).rejects.toThrow(/not accepting entries/);
  });

  it('rejects when entry close date has passed', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      status: 'entries_open',
      entryCloseDate: new Date(Date.now() - 60_000), // 1 min ago
    });
    const showClass = await makeShowClass({ showId: show.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.payments.createIntent({
        showId: show.id,
        dogId: dog.id,
        classIds: [showClass.id],
      }),
    ).rejects.toThrow(/closing date has passed/);
  });

  it('rejects when a classId belongs to a different show', async () => {
    const { exhibitor, show, dog } = await entryReadyShow();
    // Build a class on a totally unrelated show
    const otherOrg = await makeOrg();
    const otherShow = await makeShow({
      organisationId: otherOrg.id,
      status: 'entries_open',
    });
    const foreignClass = await makeShowClass({ showId: otherShow.id });
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.payments.createIntent({
        showId: show.id,
        dogId: dog.id,
        classIds: [foreignClass.id],
      }),
    ).rejects.toThrow(/invalid for this show/);
  });

  it('rejects unauthenticated callers', async () => {
    const { show, showClass, dog } = await entryReadyShow();
    const caller = createTestCaller(null);

    await expect(
      caller.payments.createIntent({
        showId: show.id,
        dogId: dog.id,
        classIds: [showClass.id],
      }),
    ).rejects.toThrow();
  });
});
