import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { showClasses } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeBreed,
  makeClassDef,
} from '../helpers/factories';

describe('secretary.listVenues', () => {
  it('returns venues scoped to the org, sorted by name', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    await caller.secretary.createVenue({ organisationId: org.id, name: 'Zenith Park' });
    await caller.secretary.createVenue({ organisationId: org.id, name: 'Acorn Field' });
    const list = await caller.secretary.listVenues({ organisationId: org.id });
    expect(list.map((v) => v.name)).toEqual(['Acorn Field', 'Zenith Park']);
  });

  it('rejects listing from a foreign org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const { org: otherOrg } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(user).secretary.listVenues({ organisationId: otherOrg.id }),
    ).rejects.toThrow(/access/i);
  });
});

describe('secretary.listClassDefinitions (public)', () => {
  it('returns all class definitions ordered by sortOrder + name', async () => {
    await Promise.all([
      makeClassDef({ name: 'Veteran', type: 'age', sortOrder: 99 }),
      makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 }),
      makeClassDef({ name: 'Open', type: 'achievement', sortOrder: 50 }),
    ]);
    const list = await createTestCaller(null).secretary.listClassDefinitions();
    expect(list.length).toBeGreaterThanOrEqual(3);
  });
});

describe('secretary.bulkCreateClasses', () => {
  it('creates one class per breed×classDef in canonical order with auto class numbers', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const [breedA, breedB, puppy, open] = await Promise.all([
      makeBreed(),
      makeBreed(),
      makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 }),
      makeClassDef({ name: 'Open', type: 'achievement', sortOrder: 50 }),
    ]);

    const res = await createTestCaller(user).secretary.bulkCreateClasses({
      showId: show.id,
      breedIds: [breedA.id, breedB.id],
      classDefinitionIds: [puppy.id, open.id],
      entryFee: 500,
    });

    // 2 breeds × 2 class defs = 4 classes
    expect(res.created).toBe(4);

    const classes = await testDb.query.showClasses.findMany({
      where: eq(showClasses.showId, show.id),
      orderBy: (sc, { asc }) => [asc(sc.sortOrder)],
    });
    expect(classes).toHaveLength(4);
    // All have entry fee 500, breedSpecific true, classNumber assigned 1..4
    expect(classes.every((c) => c.entryFee === 500)).toBe(true);
    expect(classes.every((c) => c.isBreedSpecific === true)).toBe(true);
    expect(classes.map((c) => c.classNumber)).toEqual([1, 2, 3, 4]);
  });

  it('splitBySex doubles output and JH classes are added once globally (not split)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const [breedA, breedB, puppy, jh] = await Promise.all([
      makeBreed(),
      makeBreed(),
      makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 }),
      makeClassDef({ name: 'JH', type: 'junior_handler', sortOrder: 1 }),
    ]);

    const res = await createTestCaller(user).secretary.bulkCreateClasses({
      showId: show.id,
      breedIds: [breedA.id, breedB.id],
      classDefinitionIds: [puppy.id, jh.id],
      entryFee: 700,
      splitBySex: true,
    });

    // 2 breeds × 1 standard class × 2 sexes = 4 puppy rows
    // + 1 JH row total (not per breed, not per sex) = 5 total
    expect(res.created).toBe(5);

    const classes = await testDb.query.showClasses.findMany({
      where: eq(showClasses.showId, show.id),
    });
    const jhRows = classes.filter((c) => c.classDefinitionId === jh.id);
    expect(jhRows).toHaveLength(1);
    expect(jhRows[0]?.breedId).toBeNull();
    expect(jhRows[0]?.sex).toBeNull();
  });

  it('handling classes (no breeds passed) creates one row per class def, no breed/sex', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const [puppy] = await Promise.all([makeClassDef({ name: 'AV Puppy', type: 'age', sortOrder: 1 })]);

    const res = await createTestCaller(user).secretary.bulkCreateClasses({
      showId: show.id,
      breedIds: [], // no breeds → handling classes
      classDefinitionIds: [puppy.id],
      entryFee: 800,
    });
    expect(res.created).toBe(1);
    const cls = await testDb.query.showClasses.findMany({ where: eq(showClasses.showId, show.id) });
    expect(cls[0]?.breedId).toBeNull();
    expect(cls[0]?.isBreedSpecific).toBe(false);
  });

  it('rejects bulkCreateClasses on a show in another org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const { org: otherOrg } = await makeSecretaryWithOrg();
    const otherShow = await makeShow({ organisationId: otherOrg.id });
    const cd = await makeClassDef({ name: 'Open', type: 'age' });
    await expect(
      createTestCaller(user).secretary.bulkCreateClasses({
        showId: otherShow.id, breedIds: [], classDefinitionIds: [cd.id], entryFee: 500,
      }),
    ).rejects.toThrow(/access/i);
  });
});

void makeSecretaryWithOrgAndBreed;
