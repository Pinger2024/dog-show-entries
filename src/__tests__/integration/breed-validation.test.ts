import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
} from '../helpers/factories';

/**
 * Regression tests for the breed validation in `orders.checkout` — the
 * live exhibitor-entry path used by `src/app/(shows)/shows/[id]/enter/page.tsx`.
 *
 * Two breed enforcement layers:
 *   1. SHOW-LEVEL — single-breed shows must reject wrong-breed dogs entirely.
 *      Primary source: `show.breedId`. Fallback: derive from showClasses
 *      and judgeAssignments (legacy shows without show.breedId set,
 *      relevant per the 6ec1d6f fix).
 *   2. CLASS-LEVEL — even on group/general shows, a class with a non-null
 *      breedId is restricted to that breed. Junior handler classes are
 *      always exempt.
 */

async function setupExhibitorAndShow(opts: {
  showBreedId?: string | null;
  classBreedId?: string | null;
  showStartDate?: string;
  showScope?: 'single_breed' | 'group' | 'general';
  classType?: 'age' | 'achievement' | 'special' | 'junior_handler';
}) {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const showBreed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: opts.showBreedId === undefined ? showBreed.id : opts.showBreedId,
    showScope: opts.showScope ?? 'single_breed',
    status: 'entries_open',
    startDate: opts.showStartDate ?? '2030-06-01',
    endDate: opts.showStartDate ?? '2030-06-01',
    firstEntryFee: 800,
  });
  const classDef = await makeClassDef({ name: 'Open', type: opts.classType ?? 'age' });
  const showClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: classDef.id,
    breedId: opts.classBreedId === undefined ? showBreed.id : opts.classBreedId,
    entryFee: 800,
  });
  return { exhibitor, org, showBreed, show, showClass, classDef };
}

describe('orders.checkout breed validation — single-breed show (primary path)', () => {
  it('rejects a dog whose breed does not match show.breedId', async () => {
    const { exhibitor, show, showClass } = await setupExhibitorAndShow({});
    const wrongBreed = await makeBreed();
    const wrongDog = await makeDog({ ownerId: exhibitor.id, breedId: wrongBreed.id });
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: wrongDog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/cannot be entered in this single-breed show/);

    // No order or entry should have been created.
    const dbEntries = await testDb.query.entries.findMany({ where: eq(entries.showId, show.id) });
    expect(dbEntries).toHaveLength(0);
  });

  it('accepts a dog whose breed matches show.breedId', async () => {
    const { exhibitor, show, showClass, showBreed } = await setupExhibitorAndShow({});
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: showBreed.id });
    const caller = createTestCaller(exhibitor);

    const result = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
    });

    expect(result).toBeDefined();
    const dbEntries = await testDb.query.entries.findMany({ where: eq(entries.showId, show.id) });
    expect(dbEntries).toHaveLength(1);
  });
});

describe('orders.checkout breed validation — single-breed show (fallback path)', () => {
  it('falls back to showClasses.breedId when show.breedId is null', async () => {
    // Legacy show shape: breed only encoded on classes, not on the show itself.
    const { exhibitor, show, showClass } = await setupExhibitorAndShow({
      showBreedId: null, // primary source missing
      // classBreedId stays as the show breed via default — provides the fallback
    });
    const wrongBreed = await makeBreed();
    const wrongDog = await makeDog({ ownerId: exhibitor.id, breedId: wrongBreed.id });
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: wrongDog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/cannot be entered in this single-breed show/);
  });

  it('skips show-level breed enforcement entirely when no breed info is anywhere', async () => {
    // Single-breed scope but neither show.breedId nor any class/judge breed.
    // Per the procedure's logic: allowedBreedIds.size === 0 → permissive.
    const { exhibitor, show, showClass } = await setupExhibitorAndShow({
      showBreedId: null,
      classBreedId: null,
    });
    const someBreed = await makeBreed();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: someBreed.id });
    const caller = createTestCaller(exhibitor);

    const result = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
    });
    expect(result).toBeDefined();
  });
});

describe('orders.checkout breed validation — class-level (any show scope)', () => {
  it('rejects a wrong-breed entry into a breed-restricted class on a group show', async () => {
    // Group show — no show-level breed restriction. But the class is
    // restricted to a specific breed; entering the wrong breed must fail.
    const { exhibitor, show, showClass } = await setupExhibitorAndShow({
      showBreedId: null,
      showScope: 'group',
      // classBreedId stays as the show breed → restricted class
    });
    const wrongBreed = await makeBreed();
    const wrongDog = await makeDog({ ownerId: exhibitor.id, breedId: wrongBreed.id });
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: wrongDog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/restricted to a different breed/);
  });

  it('skips class breed check for junior_handler classes (any breed allowed)', async () => {
    const { exhibitor, show, showClass } = await setupExhibitorAndShow({
      showBreedId: null, // no show-level restriction
      showScope: 'group',
      classType: 'junior_handler',
      // classBreedId stays as showBreed but JH bypasses
    });
    const wrongBreed = await makeBreed();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: wrongBreed.id });
    const caller = createTestCaller(exhibitor);

    const result = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
    });
    expect(result).toBeDefined();
  });

  it('does not enforce the show-level breed gate on group shows', async () => {
    // Group show with show.breedId still null — the show-scope guard means
    // wrong-breed dogs are NOT auto-rejected (only class-level checks apply).
    const { exhibitor, show } = await setupExhibitorAndShow({
      showBreedId: null,
      classBreedId: null,
      showScope: 'group',
    });
    // Replace the default class with an unrestricted (no breedId) class
    const wrongBreed = await makeBreed();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: wrongBreed.id });
    const openDef = await makeClassDef({ name: 'AV Open', type: 'age' });
    const avClass = await makeShowClass({ showId: show.id, classDefinitionId: openDef.id, entryFee: 800 });
    const caller = createTestCaller(exhibitor);

    const result = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [avClass.id], isNfc: false }],
    });
    expect(result).toBeDefined();
  });
});

describe('orders.checkout RKC age validation', () => {
  /**
   * dateOfBirth such that the dog is exactly N months old on the show day.
   * Anchor date intentionally uses day-of-month ≤ 28 so `setMonth(-N)`
   * doesn't overflow into the next/previous month.
   */
  const dobForMonthsOnShowDay = (months: number) => {
    const showDay = new Date('2030-06-01');
    const dob = new Date(showDay);
    dob.setMonth(dob.getMonth() - months);
    return dob.toISOString().slice(0, 10);
  };

  it('rejects a dog under 4 months on show day (competition entry)', async () => {
    const { exhibitor, show, showClass, showBreed } = await setupExhibitorAndShow({});
    const dog = await makeDog({
      ownerId: exhibitor.id,
      breedId: showBreed.id,
      dateOfBirth: dobForMonthsOnShowDay(3),
    });
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/at least 6 months old/);
  });

  it('rejects a dog 4–6 months for competition with an NFC suggestion', async () => {
    const { exhibitor, show, showClass, showBreed } = await setupExhibitorAndShow({});
    const dog = await makeDog({
      ownerId: exhibitor.id,
      breedId: showBreed.id,
      dateOfBirth: dobForMonthsOnShowDay(5),
    });
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/Not For Competition \(NFC\) instead/);
  });

  it('accepts an NFC entry for a 12+ week old dog under 6 months', async () => {
    const { exhibitor, show, showClass, showBreed } = await setupExhibitorAndShow({});
    const dog = await makeDog({
      ownerId: exhibitor.id,
      breedId: showBreed.id,
      dateOfBirth: dobForMonthsOnShowDay(4),
    });
    const caller = createTestCaller(exhibitor);

    const result = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: true }],
    });
    expect(result).toBeDefined();
  });
});

