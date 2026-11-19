import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { judgeAssignments } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
  makeUser,
  makeStewardAssignment,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
} from '../helpers/factories';
import {
  GET as resultsApprovalGET,
  POST as resultsApprovalPOST,
} from '@/app/api/results-approval/[token]/route';
import { NextRequest } from 'next/server';

async function judgeWithApprovalToken() {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id, breedId: breed.id, status: 'in_progress',
  });
  const judge = await makeJudge({ contactEmail: 'j@test.local' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
  const steward = await makeUser({ role: 'steward' });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });
  // A judge can only be asked to approve results that exist — record one first.
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  const entry = await makeEntry({
    showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed',
  });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: steward.id });
  // Trigger token generation via the steward submitForJudgeApproval procedure:
  // it stamps an approvalToken on every assignment row for that judge/show.
  await createTestCaller(steward).steward.submitForJudgeApproval({
    showId: show.id, judgeId: judge.id,
  });
  const assignment = await testDb.query.judgeAssignments.findFirst({
    where: and(eq(judgeAssignments.showId, show.id), eq(judgeAssignments.judgeId, judge.id)),
  });
  void user;
  return { assignment: assignment!, show, judge };
}

const params = (token: string) => ({ params: Promise.resolve({ token }) });

function postReq(token: string, form: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.append(k, v);
  return new NextRequest(`http://localhost/api/results-approval/${token}`, {
    method: 'POST',
    body: fd,
  });
}

describe('GET /api/results-approval/[token]', () => {
  it('returns the approval page for a valid token', async () => {
    const { assignment } = await judgeWithApprovalToken();
    const res = await resultsApprovalGET(
      new NextRequest(`http://localhost/api/results-approval/${assignment.approvalToken}`),
      params(assignment.approvalToken!),
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown token', async () => {
    const res = await resultsApprovalGET(
      new NextRequest('http://localhost/api/results-approval/no-such-token'),
      params('00000000-0000-0000-0000-000000000000'),
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/results-approval/[token] approve', () => {
  it('marks assignment approved + stamps approvedAt + stores note', async () => {
    const { assignment } = await judgeWithApprovalToken();
    const res = await resultsApprovalPOST(
      postReq(assignment.approvalToken!, { action: 'approve', note: 'All good!' }),
      params(assignment.approvalToken!),
    );
    expect(res.status).toBe(200);
    const refreshed = await testDb.query.judgeAssignments.findFirst({
      where: eq(judgeAssignments.id, assignment.id),
    });
    expect(refreshed?.approvalStatus).toBe('approved');
    expect(refreshed?.approvedAt).toBeInstanceOf(Date);
    expect(refreshed?.approvalNote).toBe('All good!');
  });

  it('rejects re-approval of an already-approved assignment', async () => {
    const { assignment } = await judgeWithApprovalToken();
    await testDb.update(judgeAssignments).set({ approvalStatus: 'approved' })
      .where(eq(judgeAssignments.id, assignment.id));
    const res = await resultsApprovalPOST(
      postReq(assignment.approvalToken!, { action: 'approve' }),
      params(assignment.approvalToken!),
    );
    // Page returns 200 with "Already Approved" content
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Already Approved/i);
  });

  it('returns 404 for unknown POST token', async () => {
    const res = await resultsApprovalPOST(
      postReq('unknown', { action: 'approve' }),
      params('00000000-0000-0000-0000-000000000000'),
    );
    expect(res.status).toBe(404);
  });
});

// Mandy, 16 Nov 2026: a regional judge approved results without seeing the
// V1 / SG2 / Disqualified the public would see — the page printed the raw
// placing. It now reads the SV rating from the one owner, in the public
// results page's order, and names Withheld / Unplaced in plain words.
describe('GET /api/results-approval/[token] — what the judge is asked to approve', () => {
  async function approvalPageFor(showRuleset: 'rkc' | 'wusv', rows: Array<{
    placement?: number | null;
    placementStatus?: string | null;
    svGrade?: 'v' | 'sg' | 'disqualified' | null;
    absent?: boolean;
    name: string;
  }>) {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress', showRuleset });
    const judge = await makeJudge({ contactEmail: 'j@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const steward = await makeUser({ role: 'steward' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    for (const r of rows) {
      const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: r.name });
      const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
      const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id, absent: r.absent });
      await makeResult({
        entryClassId: ec.id,
        placement: r.placement ?? null,
        placementStatus: r.placementStatus ?? null,
        svGrade: r.svGrade ?? null,
        recordedBy: steward.id,
      });
    }
    await createTestCaller({ ...steward, name: steward.name ?? 'Steward' }).steward.submitForJudgeApproval({
      showId: show.id, judgeId: judge.id,
    });
    const assignment = await testDb.query.judgeAssignments.findFirst({
      where: and(eq(judgeAssignments.showId, show.id), eq(judgeAssignments.judgeId, judge.id)),
    });
    const res = await resultsApprovalGET(
      new NextRequest(`http://localhost/api/results-approval/${assignment!.approvalToken}`),
      params(assignment!.approvalToken!),
    );
    expect(res.status).toBe(200);
    const page = await res.text();
    // dog name → what its Result cell says, in page order.
    return [...page.matchAll(/<td>([^<]*)<\/td>\s*<td><span class="placement-badge[^"]*">([^<]*)<\/span><\/td>/g)].map(
      (m) => [m[1], m[2]],
    );
  }

  it('a regional shows the SV rating — V1, V2, Disqualified — never a placing or a V3', async () => {
    const rows = await approvalPageFor('wusv', [
      { name: 'Growler', placementStatus: 'unplaced', svGrade: 'disqualified' },
      { name: 'Second', placement: 2, svGrade: 'v' },
      { name: 'Bulk Graded', placementStatus: 'unplaced', svGrade: 'v' },
      { name: 'First', placement: 1, svGrade: 'v' },
      { name: 'Held Back', placementStatus: 'withheld' },
    ]);
    const cells = Object.fromEntries(rows);
    expect(cells['First']).toBe('V1');
    expect(cells['Second']).toBe('V2');
    expect(cells['Growler']).toBe('Disqualified');
    expect(cells['Bulk Graded']).toBe('Unplaced');
    expect(cells['Held Back']).toBe('Withheld');
    expect(rows.map(([, label]) => label)).not.toContain('V3');
    expect(rows.map(([, label]) => label)).not.toContain('1st');
    // The public results page's order: placings first, then the rest.
    expect(rows.slice(0, 2).map(([name]) => name)).toEqual(['First', 'Second']);
  });

  it('a regional ranks only the dogs the public page shows — an absent dog with a stale placing takes no V', async () => {
    const rows = await approvalPageFor('wusv', [
      { name: 'Stale', placement: 1, svGrade: 'v', absent: true },
      { name: 'Winner', placement: 2, svGrade: 'v' },
    ]);
    expect(Object.fromEntries(rows)['Winner']).toBe('V1');
    expect(rows.map(([name]) => name)).not.toContain('Stale');
  });

  it('a regional class with no grades (Junior Handling) still reads 1st, not a bare "1"', async () => {
    const rows = await approvalPageFor('wusv', [
      { name: 'Handler Winner', placement: 1 },
      { name: 'Handler Second', placement: 2 },
    ]);
    expect(rows).toEqual([
      ['Handler Winner', '1st'],
      ['Handler Second', '2nd'],
    ]);
  });

  it('an RKC show still shows placings, with Withheld and Unplaced in plain words', async () => {
    const rows = await approvalPageFor('rkc', [
      { name: 'Unplaced Dog', placementStatus: 'unplaced' },
      { name: 'Winner', placement: 1 },
      { name: 'Held Back', placementStatus: 'withheld' },
    ]);
    expect(rows[0]).toEqual(['Winner', '1st']);
    expect(Object.fromEntries(rows)).toEqual({ Winner: '1st', 'Unplaced Dog': 'Unplaced', 'Held Back': 'Withheld' });
  });
});
