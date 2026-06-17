import { describe, it, expect } from 'vitest';
import { entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeOrder,
  makeUser,
} from '../helpers/factories';
import { computeClassBreakdown } from '@/lib/class-breakdown';

// Mandy, BAGSD 2026-06-17: the Financial page's "Entries by Class" card must
// count the TRUE ring numbers — every confirmed catalogue entry regardless of
// how it was paid (incl. entries settled directly to the club, which have no
// Remi order), plus NFC entries — so the total ties to the catalogue. This is
// broader than getEntryReport, which is paid-via-Remi only.
describe('getClassBreakdownReport — full catalogue entry set (Mandy/BAGSD)', () => {
  async function fixture() {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    return { secretary, exhibitor, show, showClass, breed };
  }

  it('counts paid-via-Remi + paid-directly + NFC entries; excludes cancelled', async () => {
    const { secretary, exhibitor, show, showClass, breed } = await fixture();

    // 1) Paid through Remi: a paid order + a confirmed competing entry.
    const paidOrder = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const dogA = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entryA = await makeEntry({ showId: show.id, dogId: dogA.id, exhibitorId: exhibitor.id, orderId: paidOrder.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entryA.id, showClassId: showClass.id });

    // 2) Paid DIRECTLY to the club (hand-added by the secretary): no order at
    //    all, but a real confirmed entry in a class (this is April's case).
    const dogB = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entryB = await makeEntry({ showId: show.id, dogId: dogB.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entryB.id, showClassId: showClass.id });

    // 3) NFC: confirmed, in the catalogue, but no judged class (no entryClasses).
    const dogC = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await testDb.insert(entries).values({
      showId: show.id, dogId: dogC.id, exhibitorId: exhibitor.id,
      status: 'confirmed', isNfc: true, totalFee: 0,
    });

    // 4) A cancelled entry — must NOT count toward the catalogue.
    const dogD = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const cancelled = await makeEntry({ showId: show.id, dogId: dogD.id, exhibitorId: exhibitor.id, status: 'cancelled' });
    await makeEntryClass({ entryId: cancelled.id, showClassId: showClass.id });

    const caller = createTestCaller(secretary);
    const report = await caller.secretary.getClassBreakdownReport({ showId: show.id });
    const breakdown = computeClassBreakdown(report);

    // The grand total ties to the catalogue: 2 competing + 1 NFC = 3.
    expect(breakdown.combinedTotals.entries).toBe(3);
    expect(breakdown.notForCompetitionTotals.entries).toBe(1);

    // The directly-paid entry (no Remi order) is counted — the whole point.
    const competing = breakdown.combinedTotals.entries - breakdown.notForCompetitionTotals.entries;
    expect(competing).toBe(2);

    // Contrast: getEntryReport (paid-via-Remi only) sees just the one paid order.
    const paidOnly = await caller.secretary.getEntryReport({ showId: show.id });
    expect(paidOnly).toHaveLength(1);
    expect(computeClassBreakdown(paidOnly).combinedTotals.entries).toBe(1);
  });
});
