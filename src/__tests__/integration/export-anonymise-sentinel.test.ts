import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import * as schema from '@/server/db/schema';
import {
  makeUser,
  makeOrg,
  makeBreedGroup,
  makeBreed,
  makeClassDef,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeJudge,
  makeJudgeAssignment,
  makeSponsor,
  makeResult,
  makeOrder,
} from '../helpers/factories';
import { exportShowFixture } from '../../../scripts/lib/export-show-fixture-core';

// Real incident this guards against (2026-09-01): awardSponsors[].sponsorName
// carried a real surname in 4 of the first 8 real-show exports, and several
// OTHER fields (orders.stripePaymentIntentId, results.critiqueText, a
// self-reported achievement's details.judgeName, sponsors.notes, ...) had
// never been checked at all. Rather than asserting field-by-field (which
// silently stops catching a regression the moment someone adds a new
// PII-bearing field and forgets to also add an assertion for it), this
// plants ONE distinctive sentinel string in EVERY currently-known
// PII-bearing location across the whole exported graph, then asserts the
// sentinel does not appear ANYWHERE in the serialised fixture — a single
// assertion that stays meaningful as the schema grows.
const SENTINEL = 'Cumberbatchington';

describe('exportShowFixture — sentinel sweep', () => {
  it('scrubs a known sentinel from every PII-bearing field before serialisation', async () => {
    const breedGroup = await makeBreedGroup();
    const breed = await makeBreed({ groupId: breedGroup.id });

    const org = await makeOrg({ contactEmail: `${SENTINEL}@example.com`, contactPhone: SENTINEL });
    const secretary = await makeUser({
      role: 'secretary',
      name: SENTINEL,
      email: `${SENTINEL.toLowerCase()}@example.com`,
      phone: SENTINEL,
      address: SENTINEL,
      postcode: SENTINEL,
      kcAccountNo: SENTINEL,
      proStripeSubscriptionId: SENTINEL,
    });
    await testDb.insert(schema.memberships).values({ userId: secretary.id, organisationId: org.id, status: 'active' });

    const [venueRow] = await testDb
      .insert(schema.venues)
      .values({ name: 'Test Venue', address: SENTINEL, postcode: SENTINEL, organisationId: org.id })
      .returning();

    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      venueId: venueRow!.id,
      secretaryUserId: secretary.id,
      secretaryName: SENTINEL,
      secretaryEmail: `${SENTINEL.toLowerCase()}@example.com`,
      secretaryPhone: SENTINEL,
      secretaryAddress: SENTINEL,
      scheduleData: {
        showManager: SENTINEL,
        firstAiders: [SENTINEL],
        welcomeNote: `Welcome, from ${SENTINEL}.`,
        guarantors: [{ name: SENTINEL, address: SENTINEL }],
        officers: [{ name: SENTINEL, position: 'Chair' }],
        awardSponsors: [{ award: 'Best in Show', sponsorName: SENTINEL, sponsorAffix: SENTINEL, trophyName: SENTINEL }],
        sponsorships: [{ sponsorName: SENTINEL, description: 'x' }],
      },
    });
    await testDb.insert(schema.showBreeds).values({ showId: show.id, breedId: breed.id });

    const classDef = await makeClassDef({ type: 'age', sortOrder: 0 });
    const showClass = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id });
    await testDb.update(schema.showClasses).set({ classNumber: 1, sortOrder: 0 }).where(eq(schema.showClasses.id, showClass.id));

    const [ring] = await testDb.insert(schema.rings).values({ showId: show.id, number: 1 }).returning();
    const judge = await makeJudge({
      name: SENTINEL,
      kcNumber: SENTINEL,
      contactEmail: `${SENTINEL.toLowerCase()}@example.com`,
      contactPhone: SENTINEL,
      kennelClubAffix: SENTINEL,
      kcJudgeId: SENTINEL,
      bio: `Judged by ${SENTINEL} for many years.`,
    });
    const ja = await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'dog', ringId: ring!.id });
    await testDb.update(schema.judgeAssignments).set({ approvalNote: SENTINEL }).where(eq(schema.judgeAssignments.id, ja.id));

    const exhibitor = await makeUser({ role: 'exhibitor', name: SENTINEL });
    const dog = await makeDog({
      ownerId: exhibitor.id,
      breedId: breed.id,
      registeredName: SENTINEL,
      kcRegNumber: `${SENTINEL}-KC`,
      microchipNumber: SENTINEL,
      sireName: SENTINEL,
      sireRegistrationNumber: SENTINEL,
      damName: SENTINEL,
      damRegistrationNumber: SENTINEL,
      breederName: SENTINEL,
      breederCity: SENTINEL,
      breederPostcode: SENTINEL,
      bio: SENTINEL,
    });
    await testDb.insert(schema.dogOwners).values({
      dogId: dog.id,
      userId: exhibitor.id,
      ownerName: SENTINEL,
      ownerAddress: SENTINEL,
      ownerEmail: `${SENTINEL.toLowerCase()}@example.com`,
      ownerPhone: SENTINEL,
    });
    await testDb.insert(schema.dogSvProfile).values({ dogId: dog.id, breedSurveyor: SENTINEL });

    const order = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      stripePaymentIntentId: `pi_${SENTINEL}`,
    });
    await testDb.update(schema.orders).set({ donationAffix: SENTINEL, regionalMembershipNumber: SENTINEL }).where(eq(schema.orders.id, order.id));

    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, orderId: order.id, status: 'confirmed' });
    await testDb.update(schema.entries).set({
      catalogueNumber: '1',
      atcNumber: SENTINEL,
      svMembershipNumber: SENTINEL,
      paymentIntentId: `pi_${SENTINEL}`,
    }).where(eq(schema.entries.id, entry.id));
    const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    await makeResult({ entryClassId: entryClass.id, placement: 1, recordedBy: secretary.id });
    await testDb.update(schema.results).set({ critiqueText: `A lovely dog, says ${SENTINEL}.` }).where(eq(schema.results.entryClassId, entryClass.id));

    // Junior handler
    const jhExhibitor = await makeUser({ role: 'exhibitor' });
    const [jhEntry] = await testDb
      .insert(schema.entries)
      .values({ showId: show.id, dogId: null, exhibitorId: jhExhibitor.id, entryType: 'junior_handler', status: 'confirmed', totalFee: 500, catalogueNumber: '2' })
      .returning();
    await testDb.insert(schema.juniorHandlerDetails).values({ entryId: jhEntry!.id, handlerName: SENTINEL, kcNumber: SENTINEL, dateOfBirth: '2015-01-01' });

    // Sponsor + class sponsorship
    const sponsor = await makeSponsor({ organisationId: org.id, contactName: SENTINEL, contactEmail: `${SENTINEL.toLowerCase()}@example.com`, notes: SENTINEL });
    const [showSponsor] = await testDb.insert(schema.showSponsors).values({ showId: show.id, sponsorId: sponsor.id, tier: 'show' }).returning();
    await testDb.insert(schema.classSponsorships).values({
      showClassId: showClass.id,
      showSponsorId: showSponsor!.id,
      sponsorName: SENTINEL,
      sponsorAffix: SENTINEL,
      trophyName: `The ${SENTINEL} Trophy`,
      trophyDonor: SENTINEL,
    });

    // Show donation
    await testDb.insert(schema.showDonations).values({ showId: show.id, donorName: SENTINEL, affix: SENTINEL });

    // Catalogue advert
    await testDb.insert(schema.catalogueAdverts).values({
      showId: show.id,
      advertiserName: SENTINEL,
      textContent: `Call ${SENTINEL} today`,
      document: 'catalogue',
      position: 'last_page',
      imageUrl: null,
    });

    // Achievement with a self-reported-style details blob (showId set, to
    // prove the defensive scrub works even though the real self-report flow
    // always uses showId: null — see anonymiseAchievementDetails's doc
    // comment in export-show-fixture-core.ts).
    await testDb.insert(schema.achievements).values({
      dogId: dog.id,
      type: 'best_of_breed',
      showId: show.id,
      date: '2030-06-01',
      details: { judgeName: SENTINEL, showName: SENTINEL, selfReported: true },
    });

    // Invoice
    await testDb.insert(schema.invoices).values({
      organisationId: org.id,
      showId: show.id,
      invoiceNumber: 'INV-SENTINEL-0001',
      clubSlug: 'SENTINEL',
      sequenceNumber: 1,
      viaRemiTotalPence: 100,
      directTotalPence: 0,
      freeEntriesCount: 0,
      cardFeeTotalPence: 0,
      feeBearingChargeCount: 0,
      discountMode: 'percentage',
      discountValue: 0,
      discountLabel: 'x',
      discountTotalPence: 0,
      packageFeePence: 0,
      packageFeeDescription: 'x',
      costsTotalPence: 0,
      netToClubPence: 100,
      lineItems: {
        viaRemi: { title: 'x', lines: [], totalLabel: 'x', totalPence: 0 },
        direct: { title: 'x', lines: [], totalLabel: 'x', totalPence: 0 },
        free: { title: 'x', lines: [], totalLabel: 'x', totalPence: 0 },
        totalEntriesLine: 'x',
        costs: { title: 'x', lines: [], totalLabel: 'x', totalPence: 0 },
      },
      issuedByUserId: secretary.id,
    });

    const fixture = await exportShowFixture(testDb, show.id, 'sentinel-test');
    const json = JSON.stringify(fixture);

    // Sanity: the sentinel actually reached the DB (and thus this test
    // would fail loudly, not silently pass, if a setup step above were
    // broken) — check it BEFORE anonymisation via a raw column read.
    const rawJudge = await testDb.query.judges.findFirst({ where: eq(schema.judges.id, judge.id) });
    expect(rawJudge?.name).toBe(SENTINEL);

    expect(json).not.toContain(SENTINEL);
  });
});
