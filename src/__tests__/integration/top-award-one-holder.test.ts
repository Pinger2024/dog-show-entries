/**
 * A top award (Best Dog, Best Bitch, Most Promising, a CC, Best of Breed …)
 * has ONE holder in its scope, whichever screen records it, and a correction
 * made after Publish Results is public straight away.
 *
 * Found in the 22 Sept 2026 bug hunt, ahead of Midland Regional (4 Oct):
 *
 *  1. `secretary.recordAchievement` removed the previous holder only for types
 *     in a hard-coded list written before configurable Best Awards existed, so
 *     correcting Best Dog / Best Bitch / Most Promising Dog (the regional
 *     awards) from dog A to dog B left BOTH dogs holding it. The steward path
 *     removed every holder, so the two record paths disagreed.
 *  2. The same function inserted with `publishedAt` NULL after the show's
 *     results were published, and nothing could publish it any more, so the
 *     public page kept the old winner (or, for a CC, showed none).
 *
 * Also pinned: a per-breed award (Best of Breed, a CC) on a multi-breed show
 * is one holder PER BREED — recording breed Y's BOB must not wipe breed X's.
 */
import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { achievements } from '@/server/db/schema';
import { ACHIEVEMENT_TYPES, type AchievementType } from '@/lib/placements';
import { awardFilter } from '@/lib/top-awards';
import { testDb } from '../helpers/db';
import { createTestCaller, type TestRole, type TestSessionUser } from '../helpers/context';
import {
  makeUser,
  makeSecretaryWithOrg,
  makeBreed,
  makeBreedGroup,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
  makeStewardAssignment,
} from '../helpers/factories';

const DATE = '2030-06-01';

/** A factory user as the session shape createTestCaller takes. */
function session(u: { id: string; email: string; name: string | null; role: string }): TestSessionUser {
  return { id: u.id, email: u.email, name: u.name ?? '', role: u.role as TestRole };
}

type Sex = 'dog' | 'bitch';

/** Secretary + steward + a show with entered, confirmed dogs of the given sexes/breeds. */
async function showWithDogs(
  opts: {
    showScope?: 'single_breed' | 'group' | 'general';
    showType?: 'open' | 'championship';
    showRuleset?: 'rkc' | 'wusv';
    dogs: { key: string; sex: Sex; breed?: 'x' | 'y' }[];
  },
) {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const steward = await makeUser({ role: 'steward' });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const group = await makeBreedGroup();
  const breedX = await makeBreed({ groupId: group.id });
  const breedY = await makeBreed({ groupId: group.id });
  const show = await makeShow({
    organisationId: org.id,
    breedId: opts.showScope && opts.showScope !== 'single_breed' ? undefined : breedX.id,
    showScope: opts.showScope ?? 'single_breed',
    showType: opts.showType ?? 'open',
    showRuleset: opts.showRuleset ?? 'rkc',
    status: 'in_progress',
  });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });
  const showClass = await makeShowClass({ showId: show.id });
  const dogIds: Record<string, string> = {};
  const entryClassIds: Record<string, string> = {};
  for (const d of opts.dogs) {
    const breedId = d.breed === 'y' ? breedY.id : breedX.id;
    const dog = await makeDog({ ownerId: exhibitor.id, breedId, sex: d.sex });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    dogIds[d.key] = dog.id;
    entryClassIds[d.key] = ec.id;
  }
  return {
    show,
    dogIds,
    entryClassIds,
    secretaryCaller: createTestCaller(session(secretary)),
    stewardCaller: createTestCaller(session(steward)),
    publicCaller: createTestCaller(null),
  };
}

async function holders(showId: string, type: AchievementType) {
  return testDb.query.achievements.findMany({
    where: and(eq(achievements.showId, showId), eq(achievements.type, type)),
  });
}

// Achievement types that are NOT a one-holder award: many dogs can hold them
// at one show (class placements, group placements, Junior Warrant points,
// Stud Book qualification). Every other type is a top award with one holder.
const MANY_HOLDER_TYPES: ReadonlySet<AchievementType> = new Set([
  'class_placement', 'group_placement', 'junior_warrant', 'stud_book',
]);

describe('secretary: correcting a top award leaves exactly one holder', () => {
  it('Best Dog corrected from dog A to dog B → one Best Dog, dog B', async () => {
    const { show, dogIds, secretaryCaller } = await showWithDogs({
      dogs: [{ key: 'a', sex: 'dog' }, { key: 'b', sex: 'dog' }],
    });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'best_dog', date: DATE });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.b!, type: 'best_dog', date: DATE });

    const rows = await holders(show.id, 'best_dog');
    expect(rows.map((r) => r.dogId)).toEqual([dogIds.b]);
  });

  it('regional Most Promising Dog corrected from A to B → one holder, dog B', async () => {
    const { show, dogIds, secretaryCaller } = await showWithDogs({
      showType: 'championship',
      showRuleset: 'wusv',
      dogs: [{ key: 'a', sex: 'dog' }, { key: 'b', sex: 'dog' }],
    });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'most_promising_young_dog', date: DATE });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.b!, type: 'most_promising_young_dog', date: DATE });

    const rows = await holders(show.id, 'most_promising_young_dog');
    expect(rows.map((r) => r.dogId)).toEqual([dogIds.b]);
  });

  it('every top-award type: A then B on a single-breed show leaves only B', async () => {
    const { show, dogIds, secretaryCaller } = await showWithDogs({
      showType: 'championship',
      dogs: [
        { key: 'dogA', sex: 'dog' }, { key: 'dogB', sex: 'dog' },
        { key: 'bitchA', sex: 'bitch' }, { key: 'bitchB', sex: 'bitch' },
      ],
    });
    const wrong: string[] = [];
    for (const type of ACHIEVEMENT_TYPES) {
      if (MANY_HOLDER_TYPES.has(type)) continue;
      const sex = awardFilter(type).sex ?? 'dog';
      const a = sex === 'bitch' ? dogIds.bitchA! : dogIds.dogA!;
      const b = sex === 'bitch' ? dogIds.bitchB! : dogIds.dogB!;
      await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: a, type, date: DATE });
      await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: b, type, date: DATE });
      const rows = await holders(show.id, type);
      if (rows.length !== 1 || rows[0]!.dogId !== b) wrong.push(`${type}: ${rows.length} holder(s)`);
    }
    expect(wrong).toEqual([]);
  }, 60_000); // ~50 recordings — generous for a loaded laptop

  it('re-recording the same dog does not add a second row', async () => {
    const { show, dogIds, secretaryCaller } = await showWithDogs({
      dogs: [{ key: 'a', sex: 'bitch' }],
    });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'best_bitch', date: DATE });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'best_bitch', date: DATE });
    expect(await holders(show.id, 'best_bitch')).toHaveLength(1);
  });

  it('refuses Best Bitch for a dog (the same sex rule the picker uses)', async () => {
    const { show, dogIds, secretaryCaller } = await showWithDogs({
      dogs: [{ key: 'male', sex: 'dog' }],
    });
    await expect(
      secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.male!, type: 'best_bitch', date: DATE }),
    ).rejects.toThrow(/bitches only/);
    expect(await holders(show.id, 'best_bitch')).toHaveLength(0);
  });
});

describe('steward and secretary record the same way', () => {
  it('steward Best Dog A → secretary corrects to B → one holder, B', async () => {
    const { show, dogIds, secretaryCaller, stewardCaller } = await showWithDogs({
      dogs: [{ key: 'a', sex: 'dog' }, { key: 'b', sex: 'dog' }],
    });
    await stewardCaller.steward.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'best_dog', date: DATE });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.b!, type: 'best_dog', date: DATE });
    expect((await holders(show.id, 'best_dog')).map((r) => r.dogId)).toEqual([dogIds.b]);
  });

  it('steward refuses Best Bitch for a dog, like the secretary', async () => {
    const { show, dogIds, stewardCaller } = await showWithDogs({
      dogs: [{ key: 'male', sex: 'dog' }],
    });
    await expect(
      stewardCaller.steward.recordAchievement({ showId: show.id, dogId: dogIds.male!, type: 'best_bitch', date: DATE }),
    ).rejects.toThrow(/bitches only/);
  });

  it('the steward and the secretary recording the same award at once still leave one holder', async () => {
    const { show, dogIds, secretaryCaller, stewardCaller } = await showWithDogs({
      dogs: [{ key: 'a', sex: 'dog' }, { key: 'b', sex: 'dog' }, { key: 'c', sex: 'dog' }],
    });
    for (let round = 0; round < 5; round++) {
      await Promise.all([
        stewardCaller.steward.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'best_dog', date: DATE }),
        secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.b!, type: 'best_dog', date: DATE }),
        secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.c!, type: 'best_dog', date: DATE }),
      ]);
      expect(await holders(show.id, 'best_dog')).toHaveLength(1);
    }
  }, 60_000);
});

describe('multi-breed show: per-breed awards are one holder PER BREED', () => {
  for (const path of ['secretary', 'steward'] as const) {
    it(`${path}: Best of Breed for breed Y leaves breed X's Best of Breed alone`, async () => {
      const ctx = await showWithDogs({
        showScope: 'general',
        dogs: [
          { key: 'x1', sex: 'dog', breed: 'x' }, { key: 'x2', sex: 'bitch', breed: 'x' },
          { key: 'y1', sex: 'dog', breed: 'y' },
        ],
      });
      const record = (dogId: string, type: AchievementType) =>
        path === 'secretary'
          ? ctx.secretaryCaller.secretary.recordAchievement({ showId: ctx.show.id, dogId, type, date: DATE })
          : ctx.stewardCaller.steward.recordAchievement({ showId: ctx.show.id, dogId, type, date: DATE });

      await record(ctx.dogIds.x1!, 'best_of_breed');
      await record(ctx.dogIds.y1!, 'best_of_breed');
      expect((await holders(ctx.show.id, 'best_of_breed')).map((r) => r.dogId).sort())
        .toEqual([ctx.dogIds.x1!, ctx.dogIds.y1!].sort());

      // …and a correction WITHIN breed X still replaces X's holder only.
      await record(ctx.dogIds.x2!, 'best_of_breed');
      expect((await holders(ctx.show.id, 'best_of_breed')).map((r) => r.dogId).sort())
        .toEqual([ctx.dogIds.x2!, ctx.dogIds.y1!].sort());
    });
  }

  it('Dog CC is per breed too', async () => {
    const { show, dogIds, secretaryCaller } = await showWithDogs({
      showScope: 'general',
      showType: 'championship',
      dogs: [{ key: 'x', sex: 'dog', breed: 'x' }, { key: 'y', sex: 'dog', breed: 'y' }],
    });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.x!, type: 'dog_cc', date: DATE });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.y!, type: 'dog_cc', date: DATE });
    expect(await holders(show.id, 'dog_cc')).toHaveLength(2);
  });

  it('Best in Show is still one holder for the whole show', async () => {
    const { show, dogIds, secretaryCaller } = await showWithDogs({
      showScope: 'general',
      dogs: [{ key: 'x', sex: 'dog', breed: 'x' }, { key: 'y', sex: 'dog', breed: 'y' }],
    });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.x!, type: 'best_in_show', date: DATE });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.y!, type: 'best_in_show', date: DATE });
    expect((await holders(show.id, 'best_in_show')).map((r) => r.dogId)).toEqual([dogIds.y]);
  });
});

describe('after Publish Results, a secretary correction is public', () => {
  async function publicHolders(
    publicCaller: ReturnType<typeof createTestCaller>,
    showId: string,
    type: AchievementType,
  ) {
    const rows = await publicCaller.steward.getPublicShowAchievements({ showId });
    return rows.filter((r) => r.type === type).map((r) => r.dogId);
  }

  it('Best Dog corrected after publishing: the public sees B, not A', async () => {
    const { show, dogIds, entryClassIds, secretaryCaller, publicCaller } = await showWithDogs({
      dogs: [{ key: 'a', sex: 'dog' }, { key: 'b', sex: 'dog' }],
    });
    // A placed class result, so the public results page has something published.
    await makeResult({ entryClassId: entryClassIds.b!, placement: 1 });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'best_dog', date: DATE });
    await secretaryCaller.secretary.publishResults({ showId: show.id, sendNotifications: false });
    expect(await publicHolders(publicCaller, show.id, 'best_dog')).toEqual([dogIds.a]);

    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.b!, type: 'best_dog', date: DATE });
    expect(await publicHolders(publicCaller, show.id, 'best_dog')).toEqual([dogIds.b]);
    const live = await publicCaller.steward.getLiveResults({ showId: show.id });
    const liveAwards = 'achievements' in live ? live.achievements : [];
    expect(liveAwards.filter((a) => a.type === 'best_dog').map((a) => a.dogId)).toEqual([dogIds.b]);
  });

  it('Dog CC corrected after publishing does not vanish from the public page', async () => {
    const { show, dogIds, secretaryCaller, publicCaller } = await showWithDogs({
      showType: 'championship',
      dogs: [{ key: 'a', sex: 'dog' }, { key: 'b', sex: 'dog' }],
    });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'dog_cc', date: DATE });
    await secretaryCaller.secretary.publishResults({ showId: show.id, sendNotifications: false });

    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.b!, type: 'dog_cc', date: DATE });
    expect(await publicHolders(publicCaller, show.id, 'dog_cc')).toEqual([dogIds.b]);
  });

  it('a forgotten award recorded after publishing goes straight to the public page', async () => {
    const { show, dogIds, secretaryCaller, publicCaller } = await showWithDogs({
      showType: 'championship',
      showRuleset: 'wusv',
      dogs: [{ key: 'b', sex: 'bitch' }],
    });
    await secretaryCaller.secretary.publishResults({ showId: show.id, sendNotifications: false });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.b!, type: 'most_promising_young_bitch', date: DATE });
    expect(await publicHolders(publicCaller, show.id, 'most_promising_young_bitch')).toEqual([dogIds.b]);
  });

  it('BEFORE publishing, a recorded award stays private (the staged release is unchanged)', async () => {
    const { show, dogIds, secretaryCaller, publicCaller } = await showWithDogs({
      dogs: [{ key: 'a', sex: 'dog' }],
    });
    await secretaryCaller.secretary.recordAchievement({ showId: show.id, dogId: dogIds.a!, type: 'best_dog', date: DATE });
    const [row] = await holders(show.id, 'best_dog');
    expect(row?.publishedAt).toBeNull();
    expect(await publicHolders(publicCaller, show.id, 'best_dog')).toEqual([]);
  });
});
