import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeSecretaryWithOrg,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeUser,
} from '../helpers/factories';

// Mandy, 2026-07-30: "Prize cards needed" counts on the Documents page, so
// she orders only what she needs instead of a full suite per class.
// secretary.getPrizeCardCounts feeds computePrizeCardCounts (src/lib/
// prize-card-counts.ts) with per-class CONFIRMED entry counts.
describe('secretary.getPrizeCardCounts', () => {
  async function fixture() {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    return { secretary, org, show, breed, exhibitor };
  }

  it('counts only CONFIRMED entries per class, excludes withdrawn/pending, and totals correctly', async () => {
    const { secretary, show, breed, exhibitor } = await fixture();

    // Class A: 3 confirmed entries — needs 1st, 2nd, 3rd but not Reserve.
    const classA = await makeShowClass({ showId: show.id, breedId: breed.id });
    for (let i = 0; i < 3; i++) {
      const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
      const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
      await makeEntryClass({ entryId: entry.id, showClassId: classA.id });
    }

    // Class B: 1 confirmed + 1 withdrawn + 1 pending — only the confirmed one
    // should count, so this class needs a 1st card only.
    const classB = await makeShowClass({ showId: show.id, breedId: breed.id });
    const confirmedDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const confirmedEntry = await makeEntry({ showId: show.id, dogId: confirmedDog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await makeEntryClass({ entryId: confirmedEntry.id, showClassId: classB.id });

    const withdrawnDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const withdrawnEntry = await makeEntry({ showId: show.id, dogId: withdrawnDog.id, exhibitorId: exhibitor.id, status: 'withdrawn' });
    await makeEntryClass({ entryId: withdrawnEntry.id, showClassId: classB.id });

    const pendingDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const pendingEntry = await makeEntry({ showId: show.id, dogId: pendingDog.id, exhibitorId: exhibitor.id, status: 'pending' });
    await makeEntryClass({ entryId: pendingEntry.id, showClassId: classB.id });

    // Class C: scheduled but zero entries — contributes nothing.
    await makeShowClass({ showId: show.id, breedId: breed.id });

    const caller = createTestCaller(secretary);
    const counts = await caller.secretary.getPrizeCardCounts({ showId: show.id });

    // first: classes with >=1 confirmed entry — A (3) and B (1) = 2.
    expect(counts.first).toBe(2);
    // second: classes with >=2 confirmed entries — only A = 1.
    expect(counts.second).toBe(1);
    // third: classes with >=3 confirmed entries — only A = 1.
    expect(counts.third).toBe(1);
    // reserve: no class has >=4 confirmed entries.
    expect(counts.reserve).toBe(0);
    // total = min(3,4) [A] + min(1,4) [B] = 3 + 1 = 4.
    expect(counts.total).toBe(4);
  });

  it('rejects a secretary from a different organisation', async () => {
    const { show } = await fixture();
    const { user: outsider } = await makeSecretaryWithOrg();

    await expect(
      createTestCaller(outsider).secretary.getPrizeCardCounts({ showId: show.id }),
    ).rejects.toThrow(/access/i);
  });
});
