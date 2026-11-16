/**
 * Disqualified at a regional (Mandy, 16 Nov 2026): "a dog at the show on
 * Sunday was disqualified due to bad behaviour, growling at the judge, but we
 * only have an option for unplaced, is there a way we can display that so it
 * shows as disqualified and no placing ie not 3rd disqualified".
 *
 * The steward's Status menu records a Disqualified dog with the shared
 * `stewardStatusWrite('disqualified')` (lib/sv-grading.ts) — no placing,
 * unplaced, grade Disqualified — and `recordResult` settles every write with
 * `settleResultWrite`, so a placed dog is never Disqualified. "Grade all as…"
 * grades placed dogs only: on the day it graded the Unplaced dog V too.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results } from '@/server/db/schema';
import { stewardStatusWrite } from '@/lib/sv-grading';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
  makeStewardAssignment,
} from '../helpers/factories';

async function regionalClass() {
  const [steward, exhibitor, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeUser({ role: 'exhibitor' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'in_progress',
    showRuleset: 'wusv',
  });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });

  async function dogInClass(opts: { absent?: boolean } = {}) {
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    return makeEntryClass({ entryId: entry.id, showClassId: showClass.id, absent: opts.absent });
  }

  return { steward, show, showClass, dogInClass, caller: createTestCaller({ ...steward, name: steward.name ?? 'Steward' }) };
}

const stored = (entryClassId: string) =>
  testDb.query.results.findFirst({ where: eq(results.entryClassId, entryClassId) });

describe('steward.recordResult — Disqualified', () => {
  it('records a Disqualified dog as no placing, unplaced, grade Disqualified', async () => {
    const { caller, dogInClass } = await regionalClass();
    const ec = await dogInClass();

    // Exactly what the Status menu's "Disqualified" sends.
    await caller.steward.recordResult({ entryClassId: ec.id, ...stewardStatusWrite('disqualified'), specialAward: null });

    const row = await stored(ec.id);
    expect(row?.placement).toBeNull();
    expect(row?.placementStatus).toBe('unplaced');
    expect(row?.svGrade).toBe('disqualified');
  });

  it('never records "3rd, Disqualified": a Disqualified grade on a placed dog takes its placing away', async () => {
    const { caller, dogInClass } = await regionalClass();
    const ec = await dogInClass();
    await makeResult({ entryClassId: ec.id, placement: 3, svGrade: 'v' });

    // What the ladder's grade box sends when Disqualified is picked beside 3rd.
    await caller.steward.recordResult({
      entryClassId: ec.id,
      placement: 3,
      placementStatus: null,
      specialAward: null,
      svGrade: 'disqualified',
    });

    const row = await stored(ec.id);
    expect(row?.placement).toBeNull();
    expect(row?.placementStatus).toBe('unplaced');
    expect(row?.svGrade).toBe('disqualified');
  });

  it('placing a Disqualified dog clears the DQ — a placed dog is never Disqualified', async () => {
    const { caller, dogInClass } = await regionalClass();
    const ec = await dogInClass();
    await makeResult({ entryClassId: ec.id, placement: null, placementStatus: 'unplaced', svGrade: 'disqualified' });

    // What tapping a dog onto the ladder sends — no grade.
    await caller.steward.recordResult({ entryClassId: ec.id, placement: 2, placementStatus: null, specialAward: null });

    const row = await stored(ec.id);
    expect(row?.placement).toBe(2);
    expect(row?.placementStatus).toBeNull();
    expect(row?.svGrade).toBeNull();
  });

  it('choosing Unplaced on a Disqualified dog clears the DQ', async () => {
    const { caller, dogInClass } = await regionalClass();
    const ec = await dogInClass();
    await makeResult({ entryClassId: ec.id, placement: null, placementStatus: 'unplaced', svGrade: 'disqualified' });

    await caller.steward.recordResult({ entryClassId: ec.id, ...stewardStatusWrite('unplaced'), specialAward: null });

    const row = await stored(ec.id);
    expect(row?.placementStatus).toBe('unplaced');
    expect(row?.svGrade).toBeNull();
  });

  it('choosing Withheld on a Disqualified dog clears the DQ, even from a caller that sends no grade', async () => {
    const { caller, dogInClass } = await regionalClass();
    const ec = await dogInClass();
    await makeResult({ entryClassId: ec.id, placement: null, placementStatus: 'unplaced', svGrade: 'disqualified' });

    await caller.steward.recordResult({ entryClassId: ec.id, placement: null, placementStatus: 'withheld' });

    const row = await stored(ec.id);
    expect(row?.placementStatus).toBe('withheld');
    expect(row?.svGrade).toBeNull();
  });

  it('a save that keeps the dog unplaced and sends no grade (the award dialog) keeps the DQ', async () => {
    const { caller, dogInClass } = await regionalClass();
    const ec = await dogInClass();
    await makeResult({ entryClassId: ec.id, placement: null, placementStatus: 'unplaced', svGrade: 'disqualified' });

    await caller.steward.recordResult({
      entryClassId: ec.id,
      placement: null,
      placementStatus: 'unplaced',
      specialAward: 'Best Puppy',
    });

    const row = await stored(ec.id);
    expect(row?.svGrade).toBe('disqualified');
    expect(row?.specialAward).toBe('Best Puppy');
  });
});

describe('steward.setClassGrades — "Grade all as…" grades placed dogs only', () => {
  it('never touches a withheld, unplaced, absent or Disqualified dog', async () => {
    const { caller, showClass, dogInClass } = await regionalClass();
    const first = await dogInClass();
    const second = await dogInClass();
    const unplaced = await dogInClass();
    const withheld = await dogInClass();
    const dq = await dogInClass();
    const absent = await dogInClass({ absent: true });
    const legacyDq = await dogInClass();
    await makeResult({ entryClassId: first.id, placement: 1 });
    await makeResult({ entryClassId: second.id, placement: 2, svGrade: 'sg' });
    await makeResult({ entryClassId: unplaced.id, placement: null, placementStatus: 'unplaced' });
    await makeResult({ entryClassId: withheld.id, placement: null, placementStatus: 'withheld' });
    await makeResult({ entryClassId: dq.id, placement: null, placementStatus: 'unplaced', svGrade: 'disqualified' });
    // Placed, then marked absent — the stale placing stays on the row.
    await makeResult({ entryClassId: absent.id, placement: 3 });
    // Recorded the only way the old screen allowed: a placing AND Disqualified.
    await makeResult({ entryClassId: legacyDq.id, placement: 4, svGrade: 'disqualified' });

    const res = await caller.steward.setClassGrades({ showClassId: showClass.id, svGrade: 'v' });

    expect(res.updated).toBe(2);
    expect((await stored(first.id))?.svGrade).toBe('v');
    expect((await stored(second.id))?.svGrade).toBe('v');
    expect((await stored(unplaced.id))?.svGrade).toBeNull();
    expect((await stored(withheld.id))?.svGrade).toBeNull();
    expect((await stored(dq.id))?.svGrade).toBe('disqualified');
    expect((await stored(absent.id))?.svGrade).toBeNull();
    expect((await stored(legacyDq.id))?.svGrade).toBe('disqualified');
  });

  it('refuses to bulk-Disqualify a class', async () => {
    const { caller, showClass, dogInClass } = await regionalClass();
    const ec = await dogInClass();
    await makeResult({ entryClassId: ec.id, placement: 1 });

    await expect(
      // @ts-expect-error — Disqualified is not a bulk grade
      caller.steward.setClassGrades({ showClassId: showClass.id, svGrade: 'disqualified' }),
    ).rejects.toThrow();
    expect((await stored(ec.id))?.svGrade).toBeNull();
  });
});
