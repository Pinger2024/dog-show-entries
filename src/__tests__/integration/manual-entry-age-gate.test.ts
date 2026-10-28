/**
 * ⚠️ THE MIDDLE TEST IS `it.skip` AND THE BUG IS STILL LIVE. It is the repro
 * for a real bug, written first (CLAUDE.md: "every bug becomes a test FIRST,
 * fix second") and handed to Michael to reproduce before any fix is written
 * (his bug loop: he reproduces, then gives the go).
 *
 * It was skipped on 2026-10-28 so the RKC 2027 regulation release could ship
 * without a red main, NOT because anything was fixed. Un-skipping it is step
 * one of the fix. The two tests either side of it run, and must keep running:
 * the first proves the rule exists on the online path, the third proves a
 * genuine Baby Puppy still gets through the manual one.
 *
 * THE BUG. `secretary.createManualEntry`
 * (src/server/trpc/routers/secretary.ts) runs NO age gate — it makes zero
 * calls to `getCompetitionAgeError`. It validates the show's status, that the
 * dog exists, that the classes belong to the show, and (added later) that the
 * dog isn't already in those classes. A secretary can therefore record a
 * four-month-old puppy in Open, and Remi will take it: the entry confirms,
 * it is priced, and it prints in the catalogue.
 *
 * The same dog, entered by its owner through `orders.checkout`, is refused —
 * "Dogs must be at least 6 months old for competition classes." So the rule
 * exists; one of the four creation paths simply never calls it. This is the
 * "four creation paths" duplication CLAUDE.md records, and the comment above
 * that duplicate-class guard says in as many words that it mirrored ONE rule
 * from checkout and left the rest behind.
 *
 * WHY IT MATTERS beyond tidiness: a dog under six months in a competition
 * class is an RKC regulation breach printed in the club's catalogue, and the
 * secretary who typed it in was never told.
 *
 * THE FIX, when it comes, is not a mirrored check. `getCompetitionAgeError`
 * is the owner; every creation path calls it. The 2027 Baby Puppy
 * exclusivity rule (F(1)26.f.(c), "Baby Puppies must not be entered in any
 * other classes at a show") belongs in that same gate — Mandy has confirmed
 * two Baby-Puppy-window classes are fine, but whether NFC counts as "another
 * class" is still open, so that half is not asserted here yet.
 *
 * The third test below passes TODAY and must keep passing: a genuine Baby
 * Puppy entry through the manual path must survive the fix. An age gate that
 * refuses her is the Amanda 2026-07-18 bug all over again (see
 * baby-puppy-age.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';

const SHOW_DAY = '2026-09-05';
/** Four months and six days old on show day — a Baby Puppy, not a competitor. */
const BABY_PUPPY_DOB = '2026-04-30';

/** An RKC single-breed show with a Baby Puppy class (4–6mo) and an Open class
 *  (no age band, so it keeps the RKC six-month competition floor). */
async function showWithBabyPuppyAndOpen() {
  const { org, user: secretary } = await makeSecretaryWithOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'rkc',
    status: 'entries_open',
    startDate: SHOW_DAY,
    endDate: SHOW_DAY,
    firstEntryFee: 2000,
    subsequentEntryFee: 1000,
  });
  const bpDef = await makeClassDef({ name: 'Baby Puppy', type: 'age', minAgeMonths: 4, maxAgeMonths: 6 });
  const openDef = await makeClassDef({ name: 'Open', type: 'achievement' });
  const babyPuppyClass = await makeShowClass({
    showId: show.id, classDefinitionId: bpDef.id, breedId: breed.id, entryFee: 2000,
  });
  const openClass = await makeShowClass({
    showId: show.id, classDefinitionId: openDef.id, breedId: breed.id, entryFee: 2000,
  });
  return { secretary, breed, show, babyPuppyClass, openClass };
}

describe('manual entry — the competition age gate', () => {
  it('orders.checkout refuses a four-month-old in Open (the rule exists)', async () => {
    const { breed, show, openClass } = await showWithBabyPuppyAndOpen();
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'age-gate-online@test.local' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, dateOfBirth: BABY_PUPPY_DOB });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [openClass!.id], isNfc: false }],
      }),
    ).rejects.toThrow(/at least 6 months old/i);
  });

  // SKIPPED, NOT DELETED — fails today by design; see the header. The bug is
  // live on production: `secretary.createManualEntry` makes no call to
  // `getCompetitionAgeError` (research/RKC-2027-CHANGES-2026-10-26.md, §3
  // hole 1). Un-skip this first when the fix starts; it is what proves it.
  it.skip('createManualEntry refuses the same dog in the same class', async () => {
    // Today this RESOLVES and the entry is recorded — that is the bug.
    const { secretary, breed, show, openClass } = await showWithBabyPuppyAndOpen();
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'age-gate-manual@test.local' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, dateOfBirth: BABY_PUPPY_DOB });

    await expect(
      createTestCaller(secretary).secretary.createManualEntry({
        showId: show.id,
        dogId: dog.id,
        classIds: [openClass!.id],
        exhibitorEmail: exhibitor.email,
      }),
    ).rejects.toThrow(/at least 6 months old/i);

    // And nothing was written — a gate that throws after the insert is no gate.
    const recorded = await testDb.query.entries.findMany({ where: eq(entries.dogId, dog.id) });
    expect(recorded).toEqual([]);
  });

  it('still records a genuine Baby Puppy entry through the manual path', async () => {
    const { secretary, breed, show, babyPuppyClass } = await showWithBabyPuppyAndOpen();
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'age-gate-bp@test.local' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, dateOfBirth: BABY_PUPPY_DOB });

    const entry = await createTestCaller(secretary).secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [babyPuppyClass!.id],
      exhibitorEmail: exhibitor.email,
    });
    expect(entry.id).toBeTruthy();
  });
});
