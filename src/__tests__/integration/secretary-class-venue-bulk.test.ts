import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { showClasses, shows } from '@/server/db/schema';
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

  it('carries a Junior Handling per-class fee through to the show juniorHandlerFee (Mandy 2026-06-12)', async () => {
    // JH entries are charged the show's flat juniorHandlerFee, not the
    // per-class fee — so a fee set while adding JH classes must propagate to
    // the show field, or it silently does nothing.
    const { user, org } = await makeSecretaryWithOrg();
    // New shows have null fees (the create flow doesn't set them).
    const show = await makeShow({ organisationId: org.id });
    const jh = await makeClassDef({ name: 'JHA Handling', type: 'junior_handler', sortOrder: 1 });

    await createTestCaller(user).secretary.bulkCreateClasses({
      showId: show.id,
      breedIds: [],
      classDefinitionIds: [jh.id],
      entryFee: 100, // £1
    });

    const updated = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(updated?.juniorHandlerFee).toBe(100);
  });

  it('carries a breed per-class fee through to the show first-entry fee (Mandy 2026-06-12)', async () => {
    // Standard breed entries are charged the show's firstEntryFee, not the
    // per-class fee — so the fee she types while adding breed classes must
    // propagate to the show field, the same way the JH fee does.
    const { user, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed' });
    const puppy = await makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 });

    await createTestCaller(user).secretary.bulkCreateClasses({
      showId: show.id, breedIds: [breed.id], classDefinitionIds: [puppy.id], entryFee: 2000, // £20
    });

    const updated = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(updated?.firstEntryFee).toBe(2000);
  });

  it('does not overwrite a first-entry fee already set on the Fees page', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed', firstEntryFee: 1500 });
    const puppy = await makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 });

    await createTestCaller(user).secretary.bulkCreateClasses({
      showId: show.id, breedIds: [breed.id], classDefinitionIds: [puppy.id], entryFee: 2000,
    });

    const updated = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(updated?.firstEntryFee).toBe(1500); // untouched
  });

  it('does not overwrite an existing juniorHandlerFee when handling classes are added at £0', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, juniorHandlerFee: 300 });
    const jh = await makeClassDef({ name: 'YKC Handling', type: 'junior_handler', sortOrder: 1 });

    await createTestCaller(user).secretary.bulkCreateClasses({
      showId: show.id,
      breedIds: [],
      classDefinitionIds: [jh.id],
      entryFee: 0,
    });

    const updated = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(updated?.juniorHandlerFee).toBe(300); // untouched
  });

  it('creating breed classes then a JH add-on yields both sets with the JH fee on the show (Mandy 2026-06-12)', async () => {
    // Mirrors the "Championship + Junior Handling in one go" UI flow, which
    // calls bulkCreateClasses once per template. Breed classes keep their own
    // fee; the handling add-on's fee lands on the show's juniorHandlerFee.
    const { user, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, showScope: 'single_breed',
    });
    const [puppy, jh] = await Promise.all([
      makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 }),
      makeClassDef({ name: 'JHA Handling', type: 'junior_handler', sortOrder: 1 }),
    ]);
    const caller = createTestCaller(user);

    // 1. breed classes (split by sex) at £25
    await caller.secretary.bulkCreateClasses({
      showId: show.id, breedIds: [breed.id], classDefinitionIds: [puppy.id], entryFee: 2500, splitBySex: true,
    });
    // 2. JH add-on at £1
    await caller.secretary.bulkCreateClasses({
      showId: show.id, breedIds: [], classDefinitionIds: [jh.id], entryFee: 100,
    });

    const classes = await testDb.query.showClasses.findMany({ where: eq(showClasses.showId, show.id) });
    expect(classes).toHaveLength(3); // 1 breed × 2 sexes + 1 JH
    const updated = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    // Both fees flow onto the show: breed → firstEntryFee, JH → juniorHandlerFee.
    expect(updated?.firstEntryFee).toBe(2500);
    expect(updated?.juniorHandlerFee).toBe(100);
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
