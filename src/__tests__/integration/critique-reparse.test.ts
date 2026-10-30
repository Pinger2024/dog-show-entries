import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { critiqueDocuments, entries, results, showClasses } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
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

// Mandy, 30 Oct 2026: the North Eastern judge's numbered document went
// through the upload route before Remi could read that layout, and was
// published as one block of opening remarks. Once Remi learns a layout, the
// secretary needs a way to have the SAVED document read again — not a
// re-upload through the judge's link, which the route refuses for a
// published document anyway. The journey here is hers: unpublish, read it
// again, review, publish.

const params = (token: string) => ({ params: Promise.resolve({ token }) });

function uploadReq(token: string, form: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.append(k, v);
  return new NextRequest(`http://localhost/api/critique-upload/${token}`, { method: 'POST', body: fd });
}

const NUMBERED_TEXT = [
  'Thank you for a lovely day.',
  '',
  'Open (Dogs) (12-11)',
  '',
  '12. A super quality dog, excellent bone and a true mover.',
  '',
  '11. Good breed type but lacking condition today.',
].join('\n');

async function seedShow() {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'completed' });
  const judge = await makeJudge({ name: 'P. Judge', contactEmail: 'p-judge@test.local' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
  const openDef = await makeClassDef({ name: 'Open', type: 'age' });
  const [openDog] = await testDb
    .insert(showClasses)
    .values({ showId: show.id, classDefinitionId: openDef.id, breedId: breed.id, sex: 'dog', entryFee: 500 })
    .returning();
  const exhibitor = await makeUser({ role: 'exhibitor' });

  const seedDog = async (name: string, catalogueNumber: string, placement: number) => {
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: name });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
    await testDb.update(entries).set({ catalogueNumber }).where(eq(entries.id, entry.id));
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: openDog.id });
    await makeResult({ entryClassId: ec.id, placement, recordedBy: secretary.id });
    return ec;
  };
  const ec12 = await seedDog('Fabatha Full Marks', '12', 1);
  const ec11 = await seedDog('Windyridge Solitaire', '11', 2);
  return { secretary, show, judge, ec12, ec11 };
}

describe('Judge critiques by catalogue number — upload, review, and the secretary reading the saved document again', () => {
  it('upload → both critiques land on their numbers → publish → unpublish → read again → publish', async () => {
    const { secretary, show, judge, ec12, ec11 } = await seedShow();
    const secretaryCaller = createTestCaller(secretary);
    const publicCaller = createTestCaller(null);

    const { uploadToken: token } = await secretaryCaller.critiques.invite({
      showId: show.id, judgeId: judge.id, email: 'p-judge@test.local',
    });

    const uploadRes = await critiqueUploadPOST(uploadReq(token, { text: NUMBERED_TEXT }), params(token));
    expect(uploadRes.status).toBe(200);
    expect((await uploadRes.json()).counts).toEqual({
      total: 3, critiques: 2, exact: 2, check: 0, unmatched: 0, hasOverview: true,
    });

    // The judge and the secretary both see the catalogue number beside the dog.
    const forJudge = await publicCaller.critiques.getByToken({ token });
    const b12 = forJudge.blocks.find((b) => b.matchedEntryClassId === ec12.id)!;
    expect(b12.catalogueNumberRaw).toBe('12');
    expect(b12.confidence).toBe('exact');
    expect(b12.matchedDisplay).toMatchObject({ registeredName: 'Fabatha Full Marks', catalogueNumber: '12', placement: 1 });
    expect(forJudge.assignableOptions.map((o) => o.catalogueNumber).sort()).toEqual(['11', '12']);

    await publicCaller.critiques.submitByToken({ token });
    await secretaryCaller.critiques.publish({ showId: show.id, judgeId: judge.id });
    expect((await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec12.id) }))?.critiqueText)
      .toMatch(/excellent bone/);
    expect((await testDb.query.results.findFirst({ where: eq(results.entryClassId, ec11.id) }))?.critiqueText)
      .toMatch(/lacking condition/);

    // Published: the document is on the results page, so it is read-only.
    await expect(secretaryCaller.critiques.reparse({ showId: show.id, judgeId: judge.id }))
      .rejects.toThrow(/Unpublish/);

    await secretaryCaller.critiques.unpublish({ showId: show.id, judgeId: judge.id });

    // Leave one critique out, then read again: the saved document is re-read
    // from scratch, so the review starts clean.
    const before = await secretaryCaller.critiques.getForSecretary({ showId: show.id, judgeId: judge.id });
    const idx11 = before.blocks.findIndex((b) => b.matchedEntryClassId === ec11.id);
    const excluded = before.blocks.map((b, i) => (i === idx11 ? { ...b, include: false } : b));
    await secretaryCaller.critiques.updateBlocks({ showId: show.id, judgeId: judge.id, blocks: excluded });

    const reread = await secretaryCaller.critiques.reparse({ showId: show.id, judgeId: judge.id });
    expect(reread.counts).toEqual({ total: 3, critiques: 2, exact: 2, check: 0, unmatched: 0, hasOverview: true });

    const after = await secretaryCaller.critiques.getForSecretary({ showId: show.id, judgeId: judge.id });
    expect(after.status).toBe('submitted'); // reading again never changes where the document is in its life
    expect(after.blocks.every((b) => b.include)).toBe(true);
    expect(after.blocks.find((b) => b.matchedEntryClassId === ec11.id)?.confidence).toBe('exact');
    expect(after.gate.canPublish).toBe(true);

    const published = await secretaryCaller.critiques.publish({ showId: show.id, judgeId: judge.id });
    expect(published.published).toBe(2);
  });

  it('cannot read again a document that was never uploaded', async () => {
    const { secretary, show, judge } = await seedShow();
    const secretaryCaller = createTestCaller(secretary);
    await secretaryCaller.critiques.invite({ showId: show.id, judgeId: judge.id, email: 'p-judge@test.local' });
    await expect(secretaryCaller.critiques.reparse({ showId: show.id, judgeId: judge.id }))
      .rejects.toThrow(/No critiques uploaded/);
    const doc = await testDb.query.critiqueDocuments.findFirst({ where: eq(critiqueDocuments.showId, show.id) });
    expect(doc?.parsedJson).toBeNull();
  });
});
