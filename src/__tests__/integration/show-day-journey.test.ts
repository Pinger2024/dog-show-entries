import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, results, shows, payments, organisations } from '@/server/db/schema';
import * as stripeService from '@/server/services/stripe';
import * as emailService from '@/server/services/email';
import * as notifications from '@/server/services/results-notifications';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeClassDef,
  makeDog,
  makeSecretaryWithOrgAndBreed,
  makeStewardAssignment,
  makePayment,
} from '../helpers/factories';

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
    await testDb.update(shows).set({ status: 'entries_open' }).where(eq(shows.id, show.id));

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
    vi.mocked(stripeService.getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          type: 'payment_intent.succeeded',
          data: {
            object: { id: intent.entryId /* not real, but unique */, metadata: { entryId: intent.entryId } },
          },
        })),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // The createIntent procedure inserted a payment row with the real intent ID;
    // bridge that to our test event by inserting another payment row keyed off the same id.
    const realPayment = await testDb.query.payments.findFirst({
      where: eq(payments.entryId, intent.entryId),
    });
    expect(realPayment).toBeTruthy();
    // Webhook updates payments by stripe_payment_id — we already have one with the real ID,
    // so reusing that is correct. No extra insert needed.

    const webhookRes = await stripeWebhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=stub' },
        body: '{}',
      }) as never,
    );
    expect(webhookRes.status).toBe(200);

    entry = await testDb.query.entries.findFirst({ where: eq(entries.id, intent.entryId) });
    expect(entry?.status).toBe('confirmed');

    // ── 4. Steward records a result for the entry ──────────────────
    await testDb.update(shows).set({ status: 'in_progress' }).where(eq(shows.id, show.id));
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
    await testDb.update(shows).set({ status: 'entries_open' }).where(eq(shows.id, showA.id));
    await testDb.update(shows).set({ status: 'entries_open' }).where(eq(shows.id, showB.id));

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
