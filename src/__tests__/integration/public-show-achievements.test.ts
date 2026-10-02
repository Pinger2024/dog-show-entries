import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeBreed,
  makeShow,
  makeUser,
  makeDog,
  makeAchievement,
} from '../helpers/factories';
import { achievements } from '@/server/db/schema';

/** Marks an achievement published, since makeAchievement always creates a draft. */
async function publish(id: string) {
  await testDb.update(achievements).set({ publishedAt: new Date() }).where(eq(achievements.id, id));
}

describe('steward.getPublicShowAchievements', () => {
  it('sorts achievements into the secretary\'s configured Best Awards order, not insertion order', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    // Deliberately non-alphabetical, non-default order: reserve before the win,
    // puppy dog before puppy bitch reversed from the championship default.
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      showType: 'championship',
      scheduleData: {
        bestAwards: [
          'Best Puppy Bitch',
          'Reserve Dog Challenge Certificate',
          'Dog Challenge Certificate',
          'Best of Breed',
        ],
      },
    });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogA = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dogB = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dogC = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dogD = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // Insert in an order that DIFFERS from the configured order, so a bug that
    // falls back to DB/insertion order would be caught.
    const bob = await makeAchievement({ showId: show.id, dogId: dogA.id, type: 'best_of_breed' });
    const dogCc = await makeAchievement({ showId: show.id, dogId: dogB.id, type: 'dog_cc' });
    const resDogCc = await makeAchievement({ showId: show.id, dogId: dogC.id, type: 'reserve_dog_cc' });
    const bpb = await makeAchievement({ showId: show.id, dogId: dogD.id, type: 'best_puppy_bitch' });
    await Promise.all([bob, dogCc, resDogCc, bpb].map((a) => publish(a.id)));

    const caller = createTestCaller(null);
    const rows = await caller.steward.getPublicShowAchievements({ showId: show.id });

    expect(rows.map((r) => r.type)).toEqual([
      'best_puppy_bitch',
      'reserve_dog_cc',
      'dog_cc',
      'best_of_breed',
    ]);
    expect(rows.map((r) => r.awardName)).toEqual([
      'Best Puppy Bitch',
      'Reserve Dog Challenge Certificate',
      'Dog Challenge Certificate',
      'Best of Breed',
    ]);
  });

  it('never drops an achievement type absent from the configured Best Awards list', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      showType: 'championship',
      scheduleData: {
        // Only Best of Breed configured — CC variants and long-coat award are
        // NOT in this list, so a hardcoded-array bug would drop them.
        bestAwards: ['Best of Breed'],
      },
    });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogA = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dogB = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dogC = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const bob = await makeAchievement({ showId: show.id, dogId: dogA.id, type: 'best_of_breed' });
    const bitchCc = await makeAchievement({ showId: show.id, dogId: dogB.id, type: 'bitch_cc' });
    const longCoat = await makeAchievement({ showId: show.id, dogId: dogC.id, type: 'best_long_coat_in_show' });
    await Promise.all([bob, bitchCc, longCoat].map((a) => publish(a.id)));

    const caller = createTestCaller(null);
    const rows = await caller.steward.getPublicShowAchievements({ showId: show.id });

    const types = rows.map((r) => r.type);
    expect(types).toContain('bitch_cc');
    expect(types).toContain('best_long_coat_in_show');
    expect(types).toContain('best_of_breed');
    expect(rows).toHaveLength(3);
    // Configured award sorts first; the un-configured ones trail after it.
    expect(types[0]).toBe('best_of_breed');
  });

  it('hides unpublished achievements from an anonymous caller but shows them to the host-org secretary', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      showType: 'championship',
      scheduleData: { bestAwards: ['Best of Breed'] },
    });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await makeAchievement({ showId: show.id, dogId: dog.id, type: 'best_of_breed' });
    // Left unpublished deliberately.

    const anonRows = await createTestCaller(null).steward.getPublicShowAchievements({ showId: show.id });
    expect(anonRows).toHaveLength(0);

    const secretaryRows = await createTestCaller(secretary).steward.getPublicShowAchievements({ showId: show.id });
    expect(secretaryRows).toHaveLength(1);
    expect(secretaryRows[0].type).toBe('best_of_breed');
  });
});
