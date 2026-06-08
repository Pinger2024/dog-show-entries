/**
 * Phase 5 steward-journey audit — fixes for the reachable, verified findings (the
 * rest, incl. the placement-collision and judge-approval-lock items that need a
 * schema change or state-machine care, are in STEWARD_JOURNEY_AUDIT.md):
 *
 *  Fix 1 — markAbsent left a recorded placement on the entry, so an absent dog
 *          surfaced as a class winner on public/live results. getLiveResults now
 *          excludes absent entries from the placement list (read-side, non-
 *          destructive — no placement is deleted).
 *  Fix 2 — getLiveResults returned ALL achievements (incl. unpublished BOB/BIS) on
 *          the wire; now mirrors getPublicShowAchievements' publishedAt filter.
 *  Fix 3 — a breed-scoped steward lost every breed-null class (Junior Handling,
 *          any-breed). getShowClasses now keeps breed-null classes visible.
 *  Fix 4 — getLiveResults / getPublicShowAchievements granted "see unpublished"
 *          by GLOBAL role, so a steward/secretary of club A could read club B's
 *          unpublished placements + awards (pre-judging leak). Privilege is now
 *          scoped to the show (assigned steward / host-org secretary / admin),
 *          and DOWNGRADES (not throws) for everyone else — a logged-in steward of
 *          another show still sees club B's PUBLISHED results.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results as resultsTable, entries as entriesTable, achievements, stewardBreedAssignments } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeMembership,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
  makeStewardAssignment,
} from '../helpers/factories';

const PAST = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 14);
  return d.toISOString().slice(0, 10);
})();

/** A live in-progress show with one assigned steward, one breed class, one confirmed entry. */
async function showWithSteward() {
  const [steward, exhibitor, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeUser({ role: 'exhibitor' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress', startDate: PAST, endDate: PAST });
  const [assignment, showClass, dog] = await Promise.all([
    makeStewardAssignment({ userId: steward.id, showId: show.id }),
    makeShowClass({ showId: show.id, breedId: breed.id }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { steward, exhibitor, org, breed, show, showClass, dog, entry, ec, assignment };
}

const liveResultCount = (live: { breedGroups: { classes: { results: unknown[] }[] }[] }) =>
  live.breedGroups.flatMap((g) => g.classes).flatMap((c) => c.results).length;

describe('Fix 1 — absent dog never shows as a placed winner', () => {
  it('excludes an absent entry from live results even with a recorded placement', async () => {
    const { steward, show, entry, ec } = await showWithSteward();
    const caller = createTestCaller(steward);
    await makeResult({ entryClassId: ec.id, placement: 1 });

    // Placement is visible while present.
    expect(liveResultCount(await caller.steward.getLiveResults({ showId: show.id }))).toBe(1);

    // Steward marks the dog absent — the stale placement must drop out.
    await caller.steward.markAbsent({ entryId: entry.id, absent: true });
    expect(liveResultCount(await caller.steward.getLiveResults({ showId: show.id }))).toBe(0);
  });
});

describe('Fix 3 — breed-scoped steward still sees breed-null classes', () => {
  it('keeps Junior Handling / any-breed classes visible to a breed-assigned steward', async () => {
    const { steward, show, breed, showClass, assignment } = await showWithSteward();
    // A breed-null class (e.g. Junior Handling) on the same show.
    const jhClass = await makeShowClass({ showId: show.id }); // no breedId → null
    // Scope the steward to the breed only.
    await testDb.insert(stewardBreedAssignments).values({
      stewardAssignmentId: assignment.id,
      breedId: breed.id,
      showDate: PAST,
    });

    const classes = await createTestCaller(steward).steward.getShowClasses({ showId: show.id });
    const ids = classes.map((c) => c.id);
    expect(ids).toContain(showClass.id); // their breed class
    expect(ids).toContain(jhClass.id);   // breed-null class still visible
  });
});

describe('Fix 4 — unpublished results are not leaked to other clubs', () => {
  it('downgrades a cross-org steward to published-only, but still serves published results', async () => {
    const { steward: stewardB, show, ec } = await showWithSteward();
    await makeResult({ entryClassId: ec.id, placement: 1 }); // recorded, NOT published

    // A steward of a DIFFERENT show (assigned elsewhere, never to show B).
    const otherShowOrg = await makeOrg();
    const otherShow = await makeShow({ organisationId: otherShowOrg.id, status: 'in_progress' });
    const intruder = await makeUser({ role: 'steward' });
    await makeStewardAssignment({ userId: intruder.id, showId: otherShow.id });
    const intruderCaller = createTestCaller(intruder);

    // (a) unpublished result is hidden from the cross-org steward (no throw).
    const hidden = await intruderCaller.steward.getLiveResults({ showId: show.id });
    expect(hidden.unpublished).toBe(true);
    expect(liveResultCount(hidden)).toBe(0);

    // (c) the show's OWN assigned steward DOES see the unpublished result.
    const owned = await createTestCaller(stewardB).steward.getLiveResults({ showId: show.id });
    expect(liveResultCount(owned)).toBe(1);

    // (b) once published, the cross-org steward receives it (downgrade ≠ block).
    await testDb.update(resultsTable).set({ publishedAt: new Date() }).where(eq(resultsTable.entryClassId, ec.id));
    const afterPublish = await intruderCaller.steward.getLiveResults({ showId: show.id });
    expect(afterPublish.unpublished).toBe(false);
    expect(liveResultCount(afterPublish)).toBe(1);
  });

  it('hides unpublished achievements from a cross-org steward but shows them to the assigned steward', async () => {
    const { steward: stewardB, show, dog } = await showWithSteward();
    await testDb.insert(achievements).values({ showId: show.id, dogId: dog.id, type: 'best_of_breed', date: PAST, publishedAt: null });

    const intruder = await makeUser({ role: 'steward' });
    const otherShow = await makeShow({ organisationId: (await makeOrg()).id, status: 'in_progress' });
    await makeStewardAssignment({ userId: intruder.id, showId: otherShow.id });

    const seenByIntruder = await createTestCaller(intruder).steward.getPublicShowAchievements({ showId: show.id });
    expect(seenByIntruder).toHaveLength(0);

    const seenByOwner = await createTestCaller(stewardB).steward.getPublicShowAchievements({ showId: show.id });
    expect(seenByOwner).toHaveLength(1);
  });

  it('downgrades a cross-org secretary too (privilege is per-show, not global role)', async () => {
    const { show, ec } = await showWithSteward();
    await makeResult({ entryClassId: ec.id, placement: 1 }); // unpublished

    // A secretary of a different org with no membership in show B's org.
    const otherOrg = await makeOrg();
    const sec = await makeUser({ role: 'secretary' });
    await makeMembership({ userId: sec.id, organisationId: otherOrg.id });

    const live = await createTestCaller(sec).steward.getLiveResults({ showId: show.id });
    expect(live.unpublished).toBe(true);
    expect(liveResultCount(live)).toBe(0);
  });
});
