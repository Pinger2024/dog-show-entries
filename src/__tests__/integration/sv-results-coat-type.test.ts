/**
 * Bug (Mandy, NE GSD Regional, 5 Sept 2026): on a wusv show, live results
 * showed two visually-identical class cards for the same age×sex — the coat
 * was never displayed and the raw stored `class_number` (e.g. 21, 22) was
 * shown instead of the canonical SV label (11a/11b) the catalogue, schedule,
 * judges-book, prize cards, ring board and reports already agree on.
 *
 * `buildClassLabelMap` / `svCoatDisplayName` (src/lib/class-labels.ts) were
 * the single source of truth everywhere EXCEPT the results surfaces — this
 * file locks in that the five results/notification surfaces now agree too,
 * and that an RKC show's output is byte-identical to before (no coat, plain
 * class number).
 */
import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { judgeAssignments } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeClassDef,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
  makeStewardAssignment,
  makeSecretaryWithOrgAndBreed,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';
import {
  GET as resultsApprovalGET,
} from '@/app/api/results-approval/[token]/route';
import { NextRequest } from 'next/server';

const PAST = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 14);
  return d.toISOString().slice(0, 10);
})();

/** A wusv regional show with ONE age×sex (Adult Bitch) split into its two
 *  coat classes — the exact shape of the reported bug (two identical-
 *  looking #21/#22 cards). Each class gets one confirmed, placed entry. */
async function wusvShowWithSplitCoatClasses() {
  const [steward, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showRuleset: 'wusv',
    status: 'in_progress',
    startDate: PAST,
    endDate: PAST,
  });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });

  // "SV Yearling" (with the disambiguation prefix the DB carries on some
  // sv_age defs) — the second half of the same bug: results printed the raw
  // "SV Yearling" next to a plain "Adult" on another card (Mandy's
  // screenshot). svDisplayAge() must strip it here too.
  const ageDef = await makeClassDef({ type: 'sv_age', name: 'SV Yearling' });

  // Raw stored class_number deliberately mimics the reported bug (21, 22 —
  // NOT 1/2) to prove the label is DERIVED, not read off the stored column.
  const longCoatClass = await makeShowClass({
    showId: show.id, breedId: breed.id, classDefinitionId: ageDef.id,
    sex: 'bitch', svCoatType: 'long_stock', classNumber: 21,
  });
  const shortCoatClass = await makeShowClass({
    showId: show.id, breedId: breed.id, classDefinitionId: ageDef.id,
    sex: 'bitch', svCoatType: 'stock', classNumber: 22,
  });

  async function enterAndPlace(showClassId: string, dogName: string) {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: dogName, sex: 'bitch' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId });
    await makeResult({ entryClassId: ec.id, placement: 1 });
    return { exhibitor, dog, entry, ec };
  }

  await enterAndPlace(longCoatClass.id, 'Long Coat Winner');
  await enterAndPlace(shortCoatClass.id, 'Short Coat Winner');

  return { steward, org, breed, show, longCoatClass, shortCoatClass };
}

describe('SV/WUSV results — coat type + canonical label (2026-09-05)', () => {
  it('getLiveResults gives the two same-age/sex coat classes distinct canonical labels + coat', async () => {
    const { steward, show, longCoatClass, shortCoatClass } = await wusvShowWithSplitCoatClasses();
    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });

    const allClasses = live.breedGroups.flatMap((g) => g.classes);
    const longCard = allClasses.find((c) => c.classId === longCoatClass.id)!;
    const shortCard = allClasses.find((c) => c.classId === shortCoatClass.id)!;

    expect(longCard).toBeDefined();
    expect(shortCard).toBeDefined();

    // Canonical SV label — NOT the raw stored class_number (21/22).
    expect(longCard.classLabel).toBe('1a');
    expect(shortCard.classLabel).toBe('1b');

    // Coat is now carried on the wire so the UI can tell the two cards apart.
    expect(longCard.svCoatType).toBe('long_stock');
    expect(shortCard.svCoatType).toBe('stock');

    // The two cards are no longer visually identical.
    expect(longCard.classLabel).not.toBe(shortCard.classLabel);
    expect(longCard.svCoatType).not.toBe(shortCard.svCoatType);

    // classNumber is kept for backwards compatibility (additive change).
    expect(longCard.classNumber).toBe(21);
    expect(shortCard.classNumber).toBe(22);

    // "SV " disambiguation prefix stripped — matches the catalogue/schedule,
    // which never show the raw def name either.
    expect(longCard.className).toBe('Yearling');
    expect(shortCard.className).toBe('Yearling');
    expect(longCard.className).not.toContain('SV');
  });

  it('an RKC show gets the plain stored class number, name and no coat (unchanged)', async () => {
    const [steward, org, breed] = await Promise.all([
      makeUser({ role: 'steward' }),
      makeOrg(),
      makeBreed(),
    ]);
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, showRuleset: 'rkc',
      status: 'in_progress', startDate: PAST, endDate: PAST,
    });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });
    // An ordinary RKC class name — svDisplayAge must be a no-op here since
    // it carries no "SV " prefix.
    const classDef = await makeClassDef({ name: 'Post Graduate' });
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'bitch', classNumber: 5,
    });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sex: 'bitch' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    await makeResult({ entryClassId: ec.id, placement: 1 });

    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    const card = live.breedGroups.flatMap((g) => g.classes).find((c) => c.classId === showClass.id)!;

    expect(card).toBeDefined();
    expect(card.classNumber).toBe(5);
    expect(card.classLabel).toBe('5'); // plain number, not an SV a/b label
    expect(card.svCoatType).toBeNull();
    expect(card.className).toBe('Post Graduate'); // svDisplayAge is a no-op
  });

  it('the judge results-approval page shows the canonical label and coat on a wusv show', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, showRuleset: 'wusv', status: 'in_progress',
    });
    void user;
    const judge = await makeJudge({ contactEmail: 'j@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const steward = await makeUser({ role: 'steward' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });

    const ageDef = await makeClassDef({ type: 'sv_age', name: 'SV Yearling' });
    // Both coat classes must exist for buildClassLabelMap to split into
    // a/b — a single coat present falls back to a plain number, which is
    // correct for a show that genuinely only offers one coat.
    const longCoatClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: ageDef.id,
      sex: 'bitch', svCoatType: 'long_stock', classNumber: 21,
    });
    const shortCoatClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: ageDef.id,
      sex: 'bitch', svCoatType: 'stock', classNumber: 22,
    });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sex: 'bitch' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: longCoatClass.id });
    await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: steward.id });
    const exhibitor2 = await makeUser({ role: 'exhibitor' });
    const dog2 = await makeDog({ ownerId: exhibitor2.id, breedId: breed.id, sex: 'bitch' });
    const entry2 = await makeEntry({ showId: show.id, dogId: dog2.id, exhibitorId: exhibitor2.id, status: 'confirmed' });
    const ec2 = await makeEntryClass({ entryId: entry2.id, showClassId: shortCoatClass.id });
    await makeResult({ entryClassId: ec2.id, placement: 1, recordedBy: steward.id });

    await createTestCaller(steward).steward.submitForJudgeApproval({ showId: show.id, judgeId: judge.id });
    const assignment = await testDb.query.judgeAssignments.findFirst({
      where: and(eq(judgeAssignments.showId, show.id), eq(judgeAssignments.judgeId, judge.id)),
    });

    const res = await resultsApprovalGET(
      new NextRequest(`http://localhost/api/results-approval/${assignment!.approvalToken}`),
      { params: Promise.resolve({ token: assignment!.approvalToken! }) },
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('#1a');
    expect(html).toContain('#1b');
    expect(html).toContain('Long Coat');
    expect(html).toContain('Short Coat');
    expect(html).not.toContain('#21');
    expect(html).not.toContain('#22');

    // "SV " prefix stripped from the class-definition name (Mandy's
    // screenshot showed "SV Yearling" next to a plain "Adult") — should
    // read "Yearling" everywhere, never "SV Yearling".
    expect(html).toContain('Yearling');
    expect(html).not.toContain('SV Yearling');
  });

  it('a Junior Handling class still shows its canonical label despite a NULL class_number', async () => {
    // Regression: the label was guarded by `classNumber != null`, but a JH
    // class carries class_number = NULL while buildClassLabelMap still gives
    // it a real label ('JHA'/'JHB'). The number-only guard therefore hid the
    // label entirely — verified against the real North East Regional show,
    // whose two JH classes map to JHA/JHB with a NULL number and which had 5
    // junior handling entries on the day (Mandy, 2026-09-05).
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, showRuleset: 'wusv', status: 'in_progress',
    });
    void user;
    const judge = await makeJudge({ contactEmail: 'jh@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const steward = await makeUser({ role: 'steward' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });

    const jhDef = await makeClassDef({ type: 'junior_handler', name: 'JHA Handling (6-11)' });
    const jhClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: jhDef.id,
      sex: null, svCoatType: null, classNumber: null,
    });

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sex: 'bitch' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: jhClass.id });
    await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: steward.id });

    // The router must carry a usable label even with no stored number …
    const live = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    const jhCard = live.breedGroups.flatMap((g) => g.classes).find((c) => c.classId === jhClass.id)!;
    expect(jhCard).toBeDefined();
    expect(jhCard.classNumber).toBeNull();
    expect(jhCard.classLabel).toBeTruthy();

    // … and the rendered judge-approval page must actually print it.
    await createTestCaller(steward).steward.submitForJudgeApproval({ showId: show.id, judgeId: judge.id });
    const assignment = await testDb.query.judgeAssignments.findFirst({
      where: and(eq(judgeAssignments.showId, show.id), eq(judgeAssignments.judgeId, judge.id)),
    });
    const res = await resultsApprovalGET(
      new NextRequest(`http://localhost/api/results-approval/${assignment!.approvalToken}`),
      { params: Promise.resolve({ token: assignment!.approvalToken! }) },
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`#${jhCard.classLabel}`);
  });

  it('an RKC judge results-approval page is unchanged (plain number, no coat)', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, showRuleset: 'rkc', status: 'in_progress',
    });
    void user;
    const judge = await makeJudge({ contactEmail: 'j2@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const steward = await makeUser({ role: 'steward' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });

    const classDef = await makeClassDef({ name: 'Post Graduate' });
    const showClass = await makeShowClass({
      showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'dog', classNumber: 3,
    });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sex: 'dog' });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: steward.id });

    await createTestCaller(steward).steward.submitForJudgeApproval({ showId: show.id, judgeId: judge.id });
    const assignment = await testDb.query.judgeAssignments.findFirst({
      where: and(eq(judgeAssignments.showId, show.id), eq(judgeAssignments.judgeId, judge.id)),
    });

    const res = await resultsApprovalGET(
      new NextRequest(`http://localhost/api/results-approval/${assignment!.approvalToken}`),
      { params: Promise.resolve({ token: assignment!.approvalToken! }) },
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('#3');
    expect(html).toContain('Post Graduate'); // svDisplayAge is a no-op
    expect(html).not.toContain('Long Coat');
    expect(html).not.toContain('Short Coat');
  });
});
