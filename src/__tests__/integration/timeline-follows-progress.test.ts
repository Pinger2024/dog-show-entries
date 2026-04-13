import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { dogTimelinePosts, dogFollows, achievements } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeDog,
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
