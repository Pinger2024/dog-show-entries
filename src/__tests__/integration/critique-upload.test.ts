import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { critiqueDocuments, showClasses, results } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeSecretaryWithOrg,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
  makeClassDef,
  makeUser,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
} from '../helpers/factories';
import { POST as critiqueUploadPOST } from '@/app/api/critique-upload/[token]/route';

// Modelled on results-approval-route.test.ts: full factory graph, driving
// the token-gated upload route handler directly, and a tRPC test caller for
// the judge (public) and secretary procedures. See
// research/DESIGN-judge-critique-upload-2026-07-31.md.

const params = (token: string) => ({ params: Promise.resolve({ token }) });

function uploadReq(token: string, form: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.append(k, v);
  return new NextRequest(`http://localhost/api/critique-upload/${token}`, {
    method: 'POST',
    body: fd,
  });
}

// makeShowClass (factories.ts) doesn't expose `sex` — every existing caller
// only needed breed-scoped classes. This feature's header matching keys on
// "<class name> Dog/Bitch", so the fixture needs real sexed show_classes;
// insert directly rather than widen the shared factory for one test file.
async function makeSexedShowClass(opts: {
  showId: string;
  classDefinitionId: string;
  breedId: string;
  sex: 'dog' | 'bitch';
}) {
  const [row] = await testDb
    .insert(showClasses)
    .values({
      showId: opts.showId,
      classDefinitionId: opts.classDefinitionId,
      breedId: opts.breedId,
      sex: opts.sex,
      entryFee: 500,
    })
    .returning();
  return row;
}

/**
 * Full show graph for the main journey: secretary/org/breed → show → judge
 * (+ assignment) → "Open Dog"/"Open Bitch" classes with placed, confirmed
 * entries → seeded results — deliberately shaped to exercise every match
 * outcome the parser/matcher produce:
 *   - Open Dog 1st (dog1)   — clean exact name match, no conflict.
 *   - Open Dog 2nd (dog2)   — the critique will misspell the dog's name —
 *                             'check' confidence.
 *   - Open Dog 3rd          — no result at that placement — 'unmatched',
 *                             needs reassigning in review.
 *   - Open Bitch 1st (bitch1) — exact name match, but a steward critique is
 *                             ALREADY on the result — a conflict.
 *   - a 4th, uncritiqued class+entry (Junior Dog) — the reassignment target
 *     for the unmatched "3rd" block.
 */
async function seedShow() {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
  const judge = await makeJudge({ name: 'A. Judge', contactEmail: 'judge@test.local' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });

  const openDef = await makeClassDef({ name: 'Open', type: 'age' });
  const openDogClass = await makeSexedShowClass({
    showId: show.id, classDefinitionId: openDef.id, breedId: breed.id, sex: 'dog',
  });
  const openBitchClass = await makeSexedShowClass({
    showId: show.id, classDefinitionId: openDef.id, breedId: breed.id, sex: 'bitch',
  });

  const exhibitor = await makeUser({ role: 'exhibitor' });

  const dog1 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Fabatha Full Marks' });
  const entry1 = await makeEntry({ showId: show.id, dogId: dog1.id, exhibitorId: exhibitor.id });
  const ec1 = await makeEntryClass({ entryId: entry1.id, showClassId: openDogClass.id });
  await makeResult({ entryClassId: ec1.id, placement: 1, recordedBy: secretary.id });

  const dog2 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Windyridge Solitaire' });
  const entry2 = await makeEntry({ showId: show.id, dogId: dog2.id, exhibitorId: exhibitor.id });
  const ec2 = await makeEntryClass({ entryId: entry2.id, showClassId: openDogClass.id });
  await makeResult({ entryClassId: ec2.id, placement: 2, recordedBy: secretary.id });

  const bitch1 = await makeDog({
    ownerId: exhibitor.id, breedId: breed.id, sex: 'bitch', registeredName: 'Clyde Valley Bonnie Lass',
  });
  const entry3 = await makeEntry({ showId: show.id, dogId: bitch1.id, exhibitorId: exhibitor.id });
  const ec3 = await makeEntryClass({ entryId: entry3.id, showClassId: openBitchClass.id });
  await makeResult({ entryClassId: ec3.id, placement: 1, recordedBy: secretary.id });
  // A steward already typed a critique on the day — the conflict this
  // feature must never silently overwrite.
  await testDb
    .update(results)
    .set({ critiqueText: 'Steward note taken on the day: lovely bitch, good mover.' })
    .where(eq(results.entryClassId, ec3.id));

  const juniorDef = await makeClassDef({ name: 'Junior', type: 'age' });
  const juniorDogClass = await makeSexedShowClass({
    showId: show.id, classDefinitionId: juniorDef.id, breedId: breed.id, sex: 'dog',
  });
  const dog4 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Sparkbrook Sky Rocket' });
  const entry4 = await makeEntry({ showId: show.id, dogId: dog4.id, exhibitorId: exhibitor.id });
  const ec4 = await makeEntryClass({ entryId: entry4.id, showClassId: juniorDogClass.id });
  await makeResult({ entryClassId: ec4.id, placement: 1, recordedBy: secretary.id });

  return { secretary, org, breed, show, judge, ec1, ec2, ec3, ec4 };
}

const CRITIQUE_TEXT = `
Thank you to the committee for a lovely show today.

Open Dog

1st, J Smith - Fabatha Full Marks
A super quality dog, excellent bone and a true mover.

2nd, A Jones - Windyridge Solitaire Oops
Good breed type but lacking condition today.

3rd, B Brown - Ghost Contender
Promising youngster, needs time to mature.

Open Bitch

1st, C White - Clyde Valley Bonnie Lass
Beautiful head and expression, moved out well for the win.
`;

/** Leaner one-class, one-critique graph for the token-security / isolation
 *  edge cases that don't need the full match-outcome matrix above. */
async function seedSimpleShow() {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
  const judge = await makeJudge({ name: 'B. Judge', contactEmail: 'b-judge@test.local' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
  const classDef = await makeClassDef({ name: 'Open', type: 'age' });
  const openDogClass = await makeSexedShowClass({
    showId: show.id, classDefinitionId: classDef.id, breedId: breed.id, sex: 'dog',
  });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Simple Dog' });
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId: openDogClass.id });
  await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: secretary.id });
  return { secretary, org, breed, show, judge, ec };
}

const SIMPLE_TEXT = `Open Dog\n\n1st, Owner Name - Simple Dog\nLovely dog, good mover.`;

describe('Judge critique upload — full journey', () => {
  it('invite → upload → review/reassign → submit → publish (both conflict resolutions) → unpublish (non-clobber)', async () => {
    const { secretary, show, judge, ec1, ec2, ec3, ec4 } = await seedShow();
    const secretaryCaller = createTestCaller(secretary);
    const publicCaller = createTestCaller(null);

    // ── 1. Invite issues a token; re-invite rotates it on the SAME row ──
    const invited = await secretaryCaller.critiques.invite({
      showId: show.id, judgeId: judge.id, email: 'judge@test.local',
    });
    expect(invited.link).toContain(invited.uploadToken);
    const firstToken = invited.uploadToken;

    const docAfterInvite = await testDb.query.critiqueDocuments.findFirst({
      where: eq(critiqueDocuments.showId, show.id),
    });
    expect(docAfterInvite?.status).toBe('invited');
    expect(docAfterInvite?.uploadToken).toBe(firstToken);
    const docId = docAfterInvite!.id;

    const reinvited = await secretaryCaller.critiques.invite({
      showId: show.id, judgeId: judge.id, email: 'judge2@test.local',
    });
    expect(reinvited.uploadToken).not.toBe(firstToken);
    const token = reinvited.uploadToken;

    const docAfterReinvite = await testDb.query.critiqueDocuments.findFirst({
      where: eq(critiqueDocuments.id, docId),
    });
    expect(docAfterReinvite?.id).toBe(docId); // one row per (show, judge) — reused, not duplicated
    expect(docAfterReinvite?.status).toBe('invited');
    expect(docAfterReinvite?.invitedEmail).toBe('judge2@test.local');
    expect(docAfterReinvite?.submittedAt).toBeNull();

    // ── 2. Drive the upload route directly with pasted text ──
    const uploadRes = await critiqueUploadPOST(uploadReq(token, { text: CRITIQUE_TEXT }), params(token));
    expect(uploadRes.status).toBe(200);
    const uploadJson = await uploadRes.json();
    expect(uploadJson.ok).toBe(true);
    expect(uploadJson.counts).toEqual({
      total: 5, critiques: 4, exact: 2, check: 1, unmatched: 1, hasOverview: true,
    });

    // ── 3. getByToken returns enriched blocks ──
    const review = await publicCaller.critiques.getByToken({ token });
    expect(review.status).toBe('invited'); // upload alone doesn't change status
    expect(review.hasUpload).toBe(true);
    expect(review.blocks).toHaveLength(5);
    expect(review.assignableOptions).toHaveLength(4); // ec1..ec4

    const overviewBlock = review.blocks.find((b) => b.kind === 'overview')!;
    expect(overviewBlock.critiqueText).toMatch(/lovely show today/);

    const exactDog1 = review.blocks.find((b) => b.matchedEntryClassId === ec1.id)!;
    expect(exactDog1.confidence).toBe('exact');
    expect(exactDog1.conflict).toBeNull();
    expect(exactDog1.matchedDisplay?.registeredName).toBe('Fabatha Full Marks');

    const checkDog2 = review.blocks.find((b) => b.matchedEntryClassId === ec2.id)!;
    expect(checkDog2.confidence).toBe('check');

    const conflictBitch = review.blocks.find((b) => b.matchedEntryClassId === ec3.id)!;
    expect(conflictBitch.confidence).toBe('exact');
    expect(conflictBitch.conflict?.existingText).toMatch(/Steward note/);
    expect(conflictBitch.resolution).toBeNull();

    const idxUnmatched = review.blocks.findIndex((b) => b.kind === 'critique' && b.matchedEntryClassId === null);
    const idxConflict = review.blocks.findIndex((b) => b.matchedEntryClassId === ec3.id);
    expect(review.blocks[idxUnmatched].confidence).toBe('unmatched');
    expect(review.blocks[idxUnmatched].dogNameCleaned).toBe('Ghost Contender');

    // ── saveBlocksByToken (judge): reassign the unmatched block to a real
    // entry class (confidence must jump to 'exact', resolution stays null),
    // AND, in the SAME call, try to set `resolution` on the conflict block —
    // judges cannot set resolution, only the secretary can.
    const blocksForSave = review.blocks.map((b) => ({ ...b }));
    blocksForSave[idxUnmatched] = { ...blocksForSave[idxUnmatched], matchedEntryClassId: ec4.id };
    blocksForSave[idxConflict] = { ...blocksForSave[idxConflict], resolution: 'existing' as const };
    await publicCaller.critiques.saveBlocksByToken({ token, blocks: blocksForSave });

    const afterSave = await testDb.query.critiqueDocuments.findFirst({ where: eq(critiqueDocuments.id, docId) });
    const savedBlocks = afterSave!.parsedJson!.blocks;
    expect(savedBlocks[idxUnmatched].matchedEntryClassId).toBe(ec4.id);
    expect(savedBlocks[idxUnmatched].confidence).toBe('exact');
    expect(savedBlocks[idxUnmatched].resolution).toBeNull();
    // The judge's attempted resolution must NOT have stuck.
    expect(savedBlocks[idxConflict].resolution).toBeNull();

    // ── Forged matchedEntryClassId from a DIFFERENT show → BAD_REQUEST ──
    const otherShowSetup = await makeSecretaryWithOrgAndBreed();
    const otherShow = await makeShow({ organisationId: otherShowSetup.org.id, breedId: otherShowSetup.breed.id });
    const otherClassDef = await makeClassDef({ name: 'Other', type: 'age' });
    const otherShowClass = await makeSexedShowClass({
      showId: otherShow.id, classDefinitionId: otherClassDef.id, breedId: otherShowSetup.breed.id, sex: 'dog',
    });
    const otherExhibitor = await makeUser({ role: 'exhibitor' });
    const otherDog = await makeDog({ ownerId: otherExhibitor.id, breedId: otherShowSetup.breed.id });
    const otherEntry = await makeEntry({ showId: otherShow.id, dogId: otherDog.id, exhibitorId: otherExhibitor.id });
    const otherEc = await makeEntryClass({ entryId: otherEntry.id, showClassId: otherShowClass.id });
    await makeResult({ entryClassId: otherEc.id, placement: 1, recordedBy: otherShowSetup.user.id });

    const reviewAfterSave = await publicCaller.critiques.getByToken({ token });
    expect(reviewAfterSave.blocks[idxUnmatched].matchedEntryClassId).toBe(ec4.id); // reassignment visible
    const forgedBlocks = reviewAfterSave.blocks.map((b) => ({ ...b }));
    forgedBlocks[idxUnmatched] = { ...forgedBlocks[idxUnmatched], matchedEntryClassId: otherEc.id };
    await expect(publicCaller.critiques.saveBlocksByToken({ token, blocks: forgedBlocks }))
      .rejects.toThrow(/not part of this show/);
    // Rejected atomically — the earlier, legitimate reassignment survives.
    const afterForgedAttempt = await testDb.query.critiqueDocuments.findFirst({ where: eq(critiqueDocuments.id, docId) });
    expect(afterForgedAttempt!.parsedJson!.blocks[idxUnmatched].matchedEntryClassId).toBe(ec4.id);

    // ── 4. submitByToken ──
    await publicCaller.critiques.submitByToken({ token });
    const afterSubmit = await testDb.query.critiqueDocuments.findFirst({ where: eq(critiqueDocuments.id, docId) });
    expect(afterSubmit?.status).toBe('submitted');
    expect(afterSubmit?.submittedAt).toBeInstanceOf(Date);

    // Publish blocked: the 'check' block (dog2) AND the unresolved conflict
    // (bitch1) both block — two independent reasons (critique-publish-gate.ts).
    const forSecretary1 = await secretaryCaller.critiques.getForSecretary({ showId: show.id, judgeId: judge.id });
    expect(forSecretary1.gate.canPublish).toBe(false);
    expect(forSecretary1.gate.blockingCount).toBe(2);
    await expect(secretaryCaller.critiques.publish({ showId: show.id, judgeId: judge.id }))
      .rejects.toThrow(/2 critiques need checking/);

    // Fix #1: exclude the 'check' block.
    const idxCheck = forSecretary1.blocks.findIndex((b) => b.matchedEntryClassId === ec2.id);
    const blocksExcludeCheck = forSecretary1.blocks.map((b) => ({ ...b }));
    blocksExcludeCheck[idxCheck] = { ...blocksExcludeCheck[idxCheck], include: false };
    const updateRes1 = await secretaryCaller.critiques.updateBlocks({
      showId: show.id, judgeId: judge.id, blocks: blocksExcludeCheck,
    });
    expect(updateRes1.gate.canPublish).toBe(false);
    expect(updateRes1.gate.blockingCount).toBe(1); // only the conflict remains
    await expect(secretaryCaller.critiques.publish({ showId: show.id, judgeId: judge.id }))
      .rejects.toThrow(/1 critique needs checking/);

    // Fix #2: resolve the conflict as 'existing' — keep the steward's text.
    const forSecretary2 = await secretaryCaller.critiques.getForSecretary({ showId: show.id, judgeId: judge.id });
    const idxConflict2 = forSecretary2.blocks.findIndex((b) => b.matchedEntryClassId === ec3.id);
    const blocksResolveExisting = forSecretary2.blocks.map((b) => ({ ...b }));
    blocksResolveExisting[idxConflict2] = { ...blocksResolveExisting[idxConflict2], resolution: 'existing' as const };
    const updateRes2 = await secretaryCaller.critiques.updateBlocks({
      showId: show.id, judgeId: judge.id, blocks: blocksResolveExisting,
    });
    expect(updateRes2.gate.canPublish).toBe(true);
    expect(updateRes2.gate.blockingCount).toBe(0);

    // ── Publish (round 1): 'existing' must NOT overwrite the steward text ──
    const publishRes1 = await secretaryCaller.critiques.publish({ showId: show.id, judgeId: judge.id });
    expect(publishRes1.published).toBe(2); // dog1 + the reassigned "3rd" block (ec4) — dog2 excluded, bitch1 kept 'existing'

    const ec1AfterPublish1 = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec1.id) });
    expect(ec1AfterPublish1?.critiqueText).toMatch(/excellent bone/);
    const ec4AfterPublish1 = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec4.id) });
    expect(ec4AfterPublish1?.critiqueText).toMatch(/Promising youngster/);
    const ec2AfterPublish1 = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec2.id) });
    expect(ec2AfterPublish1?.critiqueText).toBeNull(); // excluded — never written
    const ec3AfterPublish1 = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec3.id) });
    expect(ec3AfterPublish1?.critiqueText).toMatch(/Steward note/); // 'existing' — NOT overwritten

    const docPublished = await testDb.query.critiqueDocuments.findFirst({ where: eq(critiqueDocuments.id, docId) });
    expect(docPublished?.status).toBe('published');
    expect(docPublished?.overviewText).toMatch(/lovely show today/);
    expect(docPublished?.publishedAt).toBeInstanceOf(Date);
    expect(docPublished?.publishedBy).toBe(secretary.id);

    // ── 6. Unpublish: non-clobber — an edit made AFTER publish must survive ──
    await testDb
      .update(results)
      .set({ critiqueText: 'Edited after publish by the secretary directly.' })
      .where(eq(results.entryClassId, ec1.id));

    await secretaryCaller.critiques.unpublish({ showId: show.id, judgeId: judge.id });

    const ec1AfterUnpublish = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec1.id) });
    expect(ec1AfterUnpublish?.critiqueText).toBe('Edited after publish by the secretary directly.'); // untouched
    const ec4AfterUnpublish = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec4.id) });
    expect(ec4AfterUnpublish?.critiqueText).toBeNull(); // unchanged since publish — cleared
    const ec3AfterUnpublish = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec3.id) });
    expect(ec3AfterUnpublish?.critiqueText).toMatch(/Steward note/); // this doc never wrote it

    const docUnpublished = await testDb.query.critiqueDocuments.findFirst({ where: eq(critiqueDocuments.id, docId) });
    expect(docUnpublished?.status).toBe('submitted');
    expect(docUnpublished?.publishedAt).toBeNull();
    expect(docUnpublished?.publishedBy).toBeNull();

    // ── Round 2: flip the conflict resolution to 'document' — now it DOES overwrite ──
    const forSecretary3 = await secretaryCaller.critiques.getForSecretary({ showId: show.id, judgeId: judge.id });
    const idxConflict3 = forSecretary3.blocks.findIndex((b) => b.matchedEntryClassId === ec3.id);
    const blocksResolveDocument = forSecretary3.blocks.map((b) => ({ ...b }));
    blocksResolveDocument[idxConflict3] = { ...blocksResolveDocument[idxConflict3], resolution: 'document' as const };
    await secretaryCaller.critiques.updateBlocks({
      showId: show.id, judgeId: judge.id, blocks: blocksResolveDocument,
    });

    const publishRes2 = await secretaryCaller.critiques.publish({ showId: show.id, judgeId: judge.id });
    expect(publishRes2.published).toBe(3); // dog1 + ec4 + bitch1 (now resolved 'document')

    const ec3AfterPublish2 = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec3.id) });
    expect(ec3AfterPublish2?.critiqueText).toMatch(/Beautiful head and expression/); // overwritten this time
    // Publish always writes its own text for every writable block, regardless
    // of what's currently stored — unlike unpublish, it is NOT non-clobber.
    const ec1AfterPublish2 = await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec1.id) });
    expect(ec1AfterPublish2?.critiqueText).toMatch(/excellent bone/);
  });

  it('rejects an unknown token — 404 from the upload route, NOT_FOUND from getByToken', async () => {
    const unknownToken = '00000000-0000-0000-0000-000000000000';
    const res = await critiqueUploadPOST(uploadReq(unknownToken, { text: SIMPLE_TEXT }), params(unknownToken));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not valid/);

    await expect(createTestCaller(null).critiques.getByToken({ token: unknownToken }))
      .rejects.toThrow(/not valid/);
  });

  it('rejects upload once the document is already published (410)', async () => {
    const { secretary, show, judge } = await seedSimpleShow();
    const secretaryCaller = createTestCaller(secretary);
    const invited = await secretaryCaller.critiques.invite({
      showId: show.id, judgeId: judge.id, email: 'b-judge@test.local',
    });
    const token = invited.uploadToken;

    await critiqueUploadPOST(uploadReq(token, { text: SIMPLE_TEXT }), params(token));
    await createTestCaller(null).critiques.submitByToken({ token });
    await secretaryCaller.critiques.publish({ showId: show.id, judgeId: judge.id });

    const res = await critiqueUploadPOST(uploadReq(token, { text: SIMPLE_TEXT }), params(token));
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toMatch(/already been published/);
  });

  it('rejects a secretary from a different organisation with FORBIDDEN', async () => {
    const { secretary, show, judge } = await seedSimpleShow();
    await createTestCaller(secretary).critiques.invite({
      showId: show.id, judgeId: judge.id, email: 'b-judge@test.local',
    });

    const { user: outsider } = await makeSecretaryWithOrg();
    const outsiderCaller = createTestCaller(outsider);

    await expect(outsiderCaller.critiques.getForSecretary({ showId: show.id, judgeId: judge.id }))
      .rejects.toThrow(/access/i);
    await expect(outsiderCaller.critiques.publish({ showId: show.id, judgeId: judge.id }))
      .rejects.toThrow(/access/i);
  });
});

describe('Judge critique upload — amber confirmation', () => {
  it("'yes, this is the right dog' (same target, check→exact) clears the gate; no other client confidence is trusted", async () => {
    const { show, judge } = await seedSimpleShow();

    // Invite directly via the row (token is all the judge flow needs).
    const [doc] = await testDb
      .insert(critiqueDocuments)
      .values({ showId: show.id, judgeId: judge.id, status: 'invited' })
      .returning();

    // Misspelled dog name → matched by class+placement but 'check'.
    const res = await critiqueUploadPOST(
      uploadReq(doc.uploadToken, { text: 'Open Dog\n\n1st, Owner Name - Simpel Dog\nLovely dog, good mover.' }),
      params(doc.uploadToken),
    );
    expect(res.status).toBe(200);

    const judgeCaller = createTestCaller(null);
    const before = await judgeCaller.critiques.getByToken({ token: doc.uploadToken });
    const amber = before.blocks.find((b) => b.kind === 'critique')!;
    expect(amber.confidence).toBe('check');

    // Confirm WITHOUT changing the target: only this transition is trusted.
    await judgeCaller.critiques.saveBlocksByToken({
      token: doc.uploadToken,
      blocks: before.blocks.map((b) =>
        b === amber ? { ...stripDisplay(b), confidence: 'exact' as const } : stripDisplay(b),
      ),
    });

    const after = await judgeCaller.critiques.getByToken({ token: doc.uploadToken });
    const confirmed = after.blocks.find((b) => b.kind === 'critique')!;
    expect(confirmed.confidence).toBe('exact');
    expect(confirmed.matchedEntryClassId).toBe(amber.matchedEntryClassId);
  });
});

function stripDisplay<T extends { matchedDisplay?: unknown }>(b: T) {
  const { matchedDisplay: _md, ...rest } = b;
  return rest;
}
