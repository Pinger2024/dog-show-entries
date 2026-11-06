/**
 * Bug-hunt #2: a secretary's manual (postal/cash) entry must cost exactly what
 * the identical dog + classes would cost online. createManualEntry summed each
 * class's entryFee (all carry the first-class rate), so a 3-class entry was
 * billed 3× the first fee instead of first + 2× subsequent — overcharging the
 * exhibitor and inflating club revenue reports.
 *
 * This cross-checks the two implementations against each other rather than a
 * hand-typed constant: same show, same classes, online checkout vs manual.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, entryClasses } from '@/server/db/schema';
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

describe('manual entry fee parity (bug-hunt #2)', () => {
  it('createManualEntry prices a multi-class entry the same as orders.checkout', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000, // £20
      subsequentEntryFee: 1000, // £10
    });
    const classes = await Promise.all([
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 }),
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 }),
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 }),
    ]);
    const classIds = classes.map((c) => c!.id);

    // Online path — exhibitor checks out their dog in all 3 classes.
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'parity-online@test.local' });
    const onlineDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: onlineDog.id, classIds, isNfc: false }],
    });
    const onlineEntry = await testDb.query.entries.findFirst({
      where: eq(entries.orderId, checkout.orderId),
    });

    // Manual path — secretary records the same 3-class entry for another dog.
    const manualDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const manualEntry = await createTestCaller(secretary).secretary.createManualEntry({
      showId: show.id,
      dogId: manualDog.id,
      classIds,
      exhibitorEmail: exhibitor.email,
    });

    // first-class + 2× subsequent = 2000 + 2×1000 = 4000 (NOT 3×2000 = 6000).
    expect(onlineEntry?.totalFee).toBe(4000);
    expect(manualEntry.totalFee).toBe(onlineEntry?.totalFee); // two implementations agree
    expect(manualEntry.totalFee).not.toBe(6000); // the old per-class-sum overcharge is gone

    // The per-class breakdown also sums to the entry total (4000), so reports
    // built from entry_classes.fee reconcile with entries.totalFee.
    const ecRows = await testDb.query.entryClasses.findMany({
      where: eq(entryClasses.entryId, manualEntry.id),
    });
    expect(ecRows).toHaveLength(3);
    expect(ecRows.reduce((s, r) => s + (r.fee ?? 0), 0)).toBe(4000);
  });
});
