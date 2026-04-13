import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, results, shows, payments, organisations } from '@/server/db/schema';
import * as notifications from '@/server/services/results-notifications';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeClassDef,
  makeDog,
  makeSecretaryWithOrgAndBreed,
  makeStewardAssignment,
  setShowStatus,
} from '../helpers/factories';
import { injectStripeEvent, buildStripeWebhookRequest } from '../helpers/stripe-event';

/**
 * The marathon test. Walks one entry from "secretary clicks New Show"
 * through "exhibitor sees their result on the public page". If this
 * passes, the show-day pipeline has end-to-end integrity. If it breaks,
 * something between two layers has drifted apart that unit tests would
 * miss.
 */
describe('end-to-end show day', () => {
  it('secretary creates show → exhibitor pays → steward records → secretary publishes → result is live', async () => {
    // ── 1. Secretary creates a show with one class ─────────────────
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const puppyClass = await makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 });
    const secretaryCaller = createTestCaller(secretary);

    const show = await secretaryCaller.shows.create({
      name: 'End-to-End Spring Open',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-05-15',
      endDate: '2030-05-15',
      classDefinitionIds: [puppyClass.id],
      entryFee: 1000,
    });

    // The show is created in 'draft'; flip it to entries_open the way
    // the secretary UI does (status update outside this procedure).
    await setShowStatus(show.id, 'entries_open');

    // ── 2. Exhibitor enters their dog and gets a payment intent ─────
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const exhibitorCaller = createTestCaller(exhibitor);

    const showClasses = await secretaryCaller.shows.getClasses({ showId: show.id });
    expect(showClasses).toHaveLength(1);
    const classId = showClasses[0]!.id;

    const intent = await exhibitorCaller.payments.createIntent({
      showId: show.id,
      dogId: dog.id,
      classIds: [classId],
    });
    expect(intent.amount).toBe(1000);

    let entry = await testDb.query.entries.findFirst({ where: eq(entries.id, intent.entryId) });
    expect(entry?.status).toBe('pending');

    // ── 3. Stripe webhook confirms the payment ─────────────────────
    // Use the REAL stripe_payment_id that createIntent stored on the payment row,
    // otherwise the webhook's "update payments where stripe_payment_id = …" matches
    // zero rows and the payment-status side of the assertion silently passes.
    const pendingPayment = await testDb.query.payments.findFirst({
      where: eq(payments.entryId, intent.entryId),
    });
    expect(pendingPayment?.stripePaymentId).toBeTruthy();

    injectStripeEvent({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: pendingPayment!.stripePaymentId,
          metadata: { entryId: intent.entryId },
        },
      },
    });

    const webhookRes = await stripeWebhook(buildStripeWebhookRequest() as never);
    expect(webhookRes.status).toBe(200);

    entry = await testDb.query.entries.findFirst({ where: eq(entries.id, intent.entryId) });
    expect(entry?.status).toBe('confirmed');
    const settledPayment = await testDb.query.payments.findFirst({
      where: eq(payments.id, pendingPayment!.id),
    });
    expect(settledPayment?.status).toBe('succeeded');

    // ── 4. Steward records a result for the entry ──────────────────
    await setShowStatus(show.id, 'in_progress');
    const steward = await makeUser({ role: 'steward' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });
    const stewardCaller = createTestCaller(steward);

    const classEntries = await stewardCaller.steward.getClassEntries({ showClassId: classId });
    expect(classEntries.entries).toHaveLength(1);
    const entryClassId = classEntries.entries[0]!.entryClassId;

    const recorded = await stewardCaller.steward.recordResult({
      entryClassId,
      placement: 1,
    });
    expect(recorded.placement).toBe(1);
    expect(recorded.publishedAt).toBeNull();

    // ── 5. Secretary publishes the results ─────────────────────────
    const published = await secretaryCaller.secretary.publishResults({ showId: show.id });
    expect(published.published).toBe(true);

    // Lock + per-result timestamps should now be set.
    const lockedShow = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(lockedShow?.resultsLockedAt).not.toBeNull();
    expect(lockedShow?.resultsPublishedAt).not.toBeNull();
    const liveResult = await testDb.query.results.findFirst({ where: eq(results.id, recorded.id) });
    expect(liveResult?.publishedAt).not.toBeNull();

    // Lock prevents further steward edits.
    await expect(
      stewardCaller.steward.recordResult({ entryClassId, placement: 2 }),
    ).rejects.toThrow(/published and locked/);

    // ── 6. Async notifications (fire-and-forget) ───────────────────
    await vi.waitFor(() => {
      expect(vi.mocked(notifications.sendExhibitorResultsEmails)).toHaveBeenCalledWith(show.id);
    });
  });

  it('does not surface entries from a different show even with the same exhibitor', async () => {
    // Sanity check that entries are scoped per show — ensures the journey
    // test's assertions aren't accidentally global.
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    await testDb
      .update(organisations)
      .set({ subscriptionStatus: 'active' })
      .where(eq(organisations.id, org.id));
    const secretaryCaller = createTestCaller(secretary);

    const showA = await secretaryCaller.shows.create({
      name: 'Show A',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-05-15',
      endDate: '2030-05-15',
      classDefinitionIds: [(await makeClassDef({ name: 'Puppy A', type: 'age' })).id],
      entryFee: 500,
    });
    const showB = await secretaryCaller.shows.create({
      name: 'Show B',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-15',
      endDate: '2030-06-15',
      classDefinitionIds: [(await makeClassDef({ name: 'Puppy B', type: 'age' })).id],
      entryFee: 500,
    });
    await Promise.all([
      setShowStatus(showA.id, 'entries_open'),
      setShowStatus(showB.id, 'entries_open'),
    ]);

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const exhibitorCaller = createTestCaller(exhibitor);
    const aClasses = await secretaryCaller.shows.getClasses({ showId: showA.id });
    await exhibitorCaller.payments.createIntent({
      showId: showA.id,
      dogId: dog.id,
      classIds: [aClasses[0]!.id],
    });

    const showBEntries = await testDb.query.entries.findMany({ where: eq(entries.showId, showB.id) });
    expect(showBEntries).toHaveLength(0);
  });
});
