/**
 * Mandy, 30 Sept 2026 (bug-hunt rules question 8): "Re-entering a withdrawn or
 * refunded dog at a regional is refused as 'already entered'. Allowed?" —
 * "yes it should be allowed".
 *
 * The regional once-per-dog rule counted ANY non-deleted entry, so a dog whose
 * entry was withdrawn, or cancelled by a refund, could never come back. It was
 * also written twice (entries.create and orders.checkout). One owner now:
 * `dogAlreadyOnRegional` — a dog is on the show unless its entry has left it
 * (`LEFT_SHOW_STATUSES`: cancelled, withdrawn).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  svReadyDogFields,
  makeSecretaryWithOrg,
} from '../helpers/factories';

async function regionalWithOneDog() {
  const { org } = await makeSecretaryWithOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'wusv',
    status: 'entries_open',
    juniorHandlerFee: 0,
    regionalFeeConfig: {
      tiers: [{ standardPence: 2000, memberPence: 1700 }],
      memberships: [],
      firstTimeEnabled: false,
      firstTimeFeePence: 0,
      donationsEnabled: false,
    },
  });
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 0 });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ...svReadyDogFields, ownerId: exhibitor.id, breedId: breed.id, kcRegNumber: 'SZ2001', microchipNumber: '981000000009999' });
  const checkout = () =>
    createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
    });
  return { show, exhibitor, dog, checkout };
}

describe('regional — a dog that has left the show can be entered again', () => {
  it('a withdrawn dog can be re-entered', async () => {
    const { show, exhibitor, dog, checkout } = await regionalWithOneDog();
    await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'withdrawn' });
    await expect(checkout()).resolves.toMatchObject({ totalAmount: 2000 });
  });

  it('a refunded (cancelled) dog can be re-entered', async () => {
    const { show, exhibitor, dog, checkout } = await regionalWithOneDog();
    await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'cancelled' });
    await expect(checkout()).resolves.toMatchObject({ totalAmount: 2000 });
  });

  it('a dog still on the show is refused, as before', async () => {
    const { show, exhibitor, dog, checkout } = await regionalWithOneDog();
    await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await expect(checkout()).rejects.toThrow(/already entered in this regional/i);
  });

  it('both entry paths ask the one owner — no inline copy of the rule', () => {
    const src = (f: string) => readFileSync(join(process.cwd(), 'src', 'server', 'trpc', 'routers', f), 'utf8');
    for (const f of ['entries.ts', 'orders.ts']) {
      expect(src(f), f).toMatch(/dogAlreadyOnRegional\(/);
      expect(src(f), f).not.toMatch(/const dupOnShow = /);
    }
  });
});
