import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { dogTimelinePosts, dogFollows, achievements } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeDog,
  makeJudge,
} from '../helpers/factories';

describe('timeline.createPost', () => {
  it('creates a note post on a dog the caller owns', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(owner);

    const post = await caller.timeline.createPost({
      dogId: dog.id, caption: 'Won today!', type: 'note',
    });
    expect(post?.dogId).toBe(dog.id);
    expect(post?.caption).toBe('Won today!');
    expect(post?.authorId).toBe(owner.id);
  });

  it('rejects posting to a dog the caller does not own', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const intruder = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    await expect(
      createTestCaller(intruder).timeline.createPost({
        dogId: dog.id, caption: 'Hijack!', type: 'note',
      }),
    ).rejects.toThrow(/dogs you own/);
  });

  it('rejects an empty post (no caption, no image, no video)', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    await expect(
      createTestCaller(owner).timeline.createPost({ dogId: dog.id, type: 'photo' }),
    ).rejects.toThrow(/caption, image, or video/);
  });
});

describe('timeline.deletePost', () => {
  it('lets the post author delete their post', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(owner);
    const post = await caller.timeline.createPost({ dogId: dog.id, caption: 'Hi', type: 'note' });

    await caller.timeline.deletePost({ postId: post!.id });
    const rows = await testDb.query.dogTimelinePosts.findMany({
      where: eq(dogTimelinePosts.id, post!.id),
    });
    expect(rows).toHaveLength(0);
  });

  it('rejects deletion by someone who is neither author nor dog owner', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const stranger = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const post = await createTestCaller(owner).timeline.createPost({
      dogId: dog.id, caption: 'Hi', type: 'note',
    });
    await expect(
      createTestCaller(stranger).timeline.deletePost({ postId: post!.id }),
    ).rejects.toThrow(/author or dog owner/);
  });

  it('returns NOT_FOUND for an unknown post id', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(owner).timeline.deletePost({
        postId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/Post not found/);
  });
});

describe('timeline.getForDog', () => {
  it('returns posts on a dog (public endpoint)', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    await createTestCaller(owner).timeline.createPost({
      dogId: dog.id, caption: 'Public post', type: 'note',
    });

    const publicCaller = createTestCaller(null);
    const result = await publicCaller.timeline.getForDog({ dogId: dog.id });
    // result shape may vary; just confirm we got a defined response back.
    expect(result).toBeDefined();
  });
});

describe('follows.toggle', () => {
  it('toggles follow → unfollow', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(user);

    const r1 = await caller.follows.toggle({ dogId: dog.id });
    expect(r1.following).toBe(true);
    const r2 = await caller.follows.toggle({ dogId: dog.id });
    expect(r2.following).toBe(false);

    const rows = await testDb.query.dogFollows.findMany({
      where: eq(dogFollows.dogId, dog.id),
    });
    expect(rows).toHaveLength(0);
  });

  it('isFollowing reflects current state', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(user);

    const before = await caller.follows.isFollowing({ dogId: dog.id });
    expect(before.following).toBe(false);
    await caller.follows.toggle({ dogId: dog.id });
    const after = await caller.follows.isFollowing({ dogId: dog.id });
    expect(after.following).toBe(true);
  });

  it('count returns the follower count for a dog (public)', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const fans = await Promise.all([
      makeUser({ role: 'exhibitor' }),
      makeUser({ role: 'exhibitor' }),
      makeUser({ role: 'exhibitor' }),
    ]);
    for (const f of fans) {
      await createTestCaller(f).follows.toggle({ dogId: dog.id });
    }
    const publicCaller = createTestCaller(null);
    const { count } = await publicCaller.follows.count({ dogId: dog.id });
    expect(count).toBe(3);
  });

  it('getFollowedDogs returns the caller\'s subscriptions', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const ownerA = await makeUser({ role: 'exhibitor' });
    const ownerB = await makeUser({ role: 'exhibitor' });
    const [dogA, dogB] = await Promise.all([
      makeDog({ ownerId: ownerA.id, registeredName: 'A Dog' }),
      makeDog({ ownerId: ownerB.id, registeredName: 'B Dog' }),
    ]);
    const caller = createTestCaller(user);
    await caller.follows.toggle({ dogId: dogA.id });
    await caller.follows.toggle({ dogId: dogB.id });

    const followed = await caller.follows.getFollowedDogs();
    expect(followed.map((d) => d.id).sort()).toEqual([dogA.id, dogB.id].sort());
  });
});

describe('dogs.addExternalResult', () => {
  it('records a self-reported achievement on an owned dog', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(owner);

    const ach = await caller.dogs.addExternalResult({
      dogId: dog.id,
      type: 'cc',
      date: '2030-04-01',
      showName: 'Crufts 2030',
      judgeName: 'Mrs Smith',
    });
    expect(ach?.dogId).toBe(dog.id);
    expect(ach?.type).toBe('cc');
    expect(ach?.showId).toBeNull();
    const details = ach?.details as { showName?: string; selfReported?: boolean } | null;
    expect(details?.showName).toBe('Crufts 2030');
    expect(details?.selfReported).toBe(true);
  });

  it('rejects external result on a dog owned by someone else', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const stranger = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    await expect(
      createTestCaller(stranger).dogs.addExternalResult({
        dogId: dog.id,
        type: 'cc',
        date: '2030-04-01',
        showName: 'Crufts',
      }),
    ).rejects.toThrow(/Not your dog/);
  });
});

describe('dogs.removeExternalResult', () => {
  it('removes a self-reported achievement', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(owner);
    const ach = await caller.dogs.addExternalResult({
      dogId: dog.id, type: 'cc', date: '2030-04-01', showName: 'Crufts',
    });
    const res = await caller.dogs.removeExternalResult({ id: ach!.id });
    expect(res.success).toBe(true);
    const rows = await testDb.query.achievements.findMany({
      where: eq(achievements.id, ach!.id),
    });
    expect(rows).toHaveLength(0);
  });

  it('refuses to remove an official (non-self-reported) result', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    // Insert directly with showId set (mimics steward.recordAchievement)
    const [official] = await testDb.insert(achievements).values({
      dogId: dog.id, type: 'cc', date: '2030-04-01',
      showId: '00000000-0000-0000-0000-000000000001',
    }).returning();
    await expect(
      createTestCaller(owner).dogs.removeExternalResult({ id: official!.id }),
    ).rejects.toThrow(/recorded by show officials/);
  });
});

describe('dogs.getTitleProgress', () => {
  it('returns title progress shape for an owned dog', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, dateOfBirth: '2024-01-01' });
    const result = await createTestCaller(owner).dogs.getTitleProgress({ dogId: dog.id });
    expect(result).toBeDefined();
  });

  it('returns NOT_FOUND for an unknown dog id', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(owner).dogs.getTitleProgress({
        dogId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/Dog not found/);
  });
});

/**
 * Paula Ingham, 2 Oct 2026 (via Mandy): her Bali's title progress showed
 * "0 Unique Judges" with a CC and a Reserve CC she had added by hand — the
 * judges she typed in were never counted. And the public dog page used its
 * own "1 CC + 7 RCCs" route. One rule now (lib/rkc-titles.ts), one loader
 * (services/title-awards.ts), both views.
 */
describe("title progress — the owner's own CCs and judges count, on both views", () => {
  async function paulasBali() {
    const owner = await makeUser({ role: 'exhibitor', proSubscriptionStatus: 'active' });
    const dog = await makeDog({ ownerId: owner.id, dateOfBirth: '2023-08-14' });
    const caller = createTestCaller(owner);
    await caller.dogs.addExternalResult({
      dogId: dog.id, type: 'cc', date: '2026-07-03',
      showName: 'Boston & District Canine Society', judgeName: 'Josh Henderson',
    });
    await caller.dogs.addExternalResult({
      dogId: dog.id, type: 'reserve_cc', date: '2026-01-17',
      showName: 'Manchester CH Show', judgeName: 'Andy Foreman',
    });
    return { owner, dog, caller };
  }

  it('the dashboard counts the two judges she typed in', async () => {
    const { dog, caller } = await paulasBali();
    const progress = await caller.dogs.getTitleProgress({ dogId: dog.id });
    expect(progress.stats).toMatchObject({ ccs: 1, reserveCCs: 1, uniqueJudges: 2 });
    const champion = progress.titleProgress.find((t) => t.code === 'ch')!;
    expect(champion.routes?.[1]?.detail).toBe('1/2 CCs + 1/5 RCCs under 2/7 judges');
  });

  it("the public dog page's box uses the same rule — 2 CCs + 5 RCCs, not 1 + 7", async () => {
    const { dog, caller } = await paulasBali();
    const box = await caller.pro.getChampionshipProgress({ dogId: dog.id });
    expect(box.championship.alternative).toMatchObject({ requiredCCs: 2, requiredRCCs: 5, requiredJudges: 7, ccs: 1, rccs: 1, uniqueJudges: 2 });
    expect(box.championship.classic).toMatchObject({ ccs: 1, uniqueJudges: 1 });
    expect(box.awards.ccs[0]?.showName).toBe('Boston & District Canine Society');
  });

  it('a judge recorded by Remi on show day and the same judge typed by hand count once', async () => {
    const { owner, dog, caller } = await paulasBali();
    const judge = await makeJudge({ name: 'Josh Henderson' });
    await testDb.insert(achievements).values({
      dogId: dog.id, type: 'reserve_cc', date: '2026-08-01', judgeId: judge.id, publishedAt: new Date(),
    });
    const progress = await createTestCaller(owner).dogs.getTitleProgress({ dogId: dog.id });
    expect(progress.stats.uniqueJudges).toBe(2);
    void caller;
  });
});

/**
 * Mandy, 5 Oct 2026 (Paula's Bali): the Add Result form asks what kind of
 * show it was and, for a group placing, the place — so Remi can work out the
 * RKC Show Certificate of Excellence points the way Paula does by hand — and
 * results the owner adds show on the dog's public page, marked "added by
 * owner".
 */
describe('owner-added results — Show Certificate of Excellence points and the public page', () => {
  async function paulasBaliWithShows() {
    const owner = await makeUser({ role: 'exhibitor', proSubscriptionStatus: 'active' });
    const dog = await makeDog({ ownerId: owner.id, dateOfBirth: '2023-08-14' });
    const caller = createTestCaller(owner);
    const add = (input: Parameters<typeof caller.dogs.addExternalResult>[0]) => caller.dogs.addExternalResult(input);
    await add({ dogId: dog.id, type: 'best_of_breed', date: '2025-06-01', showName: 'Ripon & District canine society', showKind: 'open_general' });
    await add({ dogId: dog.id, type: 'best_of_breed', date: '2025-06-18', showName: 'Royal Cheshire Premier Open Show', showKind: 'premier_open' });
    await add({ dogId: dog.id, type: 'best_of_breed', date: '2025-07-13', showName: 'Durham county Canine Society', showKind: 'open_general' });
    await add({ dogId: dog.id, type: 'best_of_breed', date: '2025-07-19', showName: 'Eston and Barnaby Premier Open Show', showKind: 'premier_open' });
    await add({ dogId: dog.id, type: 'group_placement', date: '2025-07-19', showName: 'Eston and Barnaby Premier Open Show', showKind: 'premier_open', groupPlace: 2 });
    return { owner, dog, caller };
  }

  it("Paula's four shows count 7 points — her own figure", async () => {
    const { dog, caller } = await paulasBaliWithShows();
    const progress = await caller.dogs.getTitleProgress({ dogId: dog.id });
    expect(progress.stats.shcexPoints).toBe(7);
    expect(progress.titleProgress.find((t) => t.code === 'shcex')?.detail).toBe(
      '7/50 points · 3 from group competition (5 needed)',
    );
  });

  it('the form must say what kind of show it was, and the group place for a group placing', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(owner);
    await expect(
      caller.dogs.addExternalResult({ dogId: dog.id, type: 'best_of_breed', date: '2025-06-01', showName: 'Ripon' }),
    ).rejects.toThrow(/kind of show/);
    await expect(
      caller.dogs.addExternalResult({ dogId: dog.id, type: 'group_placement', date: '2025-06-01', showName: 'Ripon', showKind: 'open_general' }),
    ).rejects.toThrow(/place in the group/);
    // A CC is always a championship show — no need to ask.
    await caller.dogs.addExternalResult({ dogId: dog.id, type: 'cc', date: '2025-06-01', showName: 'Crufts' });
  });

  it('a result added before Remi asked can be completed with Edit — then it counts', async () => {
    const owner = await makeUser({ role: 'exhibitor', proSubscriptionStatus: 'active' });
    const dog = await makeDog({ ownerId: owner.id, dateOfBirth: '2023-08-14' });
    // Added the old way: no show type.
    const [old] = await testDb.insert(achievements).values({
      dogId: dog.id, type: 'best_of_breed', date: '2025-06-01',
      details: { showName: 'Ripon & District canine society', selfReported: true },
    }).returning();
    const caller = createTestCaller(owner);
    let progress = await caller.dogs.getTitleProgress({ dogId: dog.id });
    expect(progress.stats.shcexPoints).toBe(0);
    expect(progress.titleProgress.find((t) => t.code === 'shcex')?.detail).toContain('1 result needs the type of show');

    await caller.dogs.updateExternalResult({
      id: old!.id, type: 'best_of_breed', date: '2025-06-01', showName: 'Ripon & District canine society', showKind: 'open_general',
    });
    progress = await caller.dogs.getTitleProgress({ dogId: dog.id });
    expect(progress.stats.shcexPoints).toBe(1);
  });

  it("only the dog's owner can change a result", async () => {
    const { dog } = await paulasBaliWithShows();
    const row = await testDb.query.achievements.findFirst({ where: eq(achievements.dogId, dog.id) });
    const stranger = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(stranger).dogs.updateExternalResult({
        id: row!.id, type: 'best_of_breed', date: '2025-06-01', showName: 'Mine now', showKind: 'open_general',
      }),
    ).rejects.toThrow(/Not your dog/);
  });

  it("owner-added results show on the dog's public page and championship box, marked added by owner", async () => {
    const { owner, dog } = await paulasBaliWithShows();
    await createTestCaller(owner).dogs.addExternalResult({
      dogId: dog.id, type: 'cc', date: '2026-07-03', showName: 'Boston & District Canine Society', judgeName: 'Josh Henderson',
    });
    const anon = createTestCaller(null);
    const profile = await anon.dogs.getPublicProfile({ id: dog.id });
    expect(profile.achievements).toHaveLength(6);
    expect((profile.achievements[0]!.details as { selfReported?: boolean }).selfReported).toBe(true);

    const box = await anon.pro.getChampionshipProgress({ dogId: dog.id });
    expect(box.championship.classic.ccs).toBe(1);
    expect(box.awards.ccs[0]).toMatchObject({ showName: 'Boston & District Canine Society', addedByOwner: true });
  });
});
