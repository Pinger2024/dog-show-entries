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
  // Trigger token generation via the steward submitForJudgeApproval procedure:
  // it stamps an approvalToken on every assignment row for that judge/show.
  const steward = await (async () => {
    const { makeUser, makeStewardAssignment } = await import('../helpers/factories');
    const s = await makeUser({ role: 'steward' });
    await makeStewardAssignment({ userId: s.id, showId: show.id });
    return s;
  })();
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
