import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { dogs, judgeAssignments, judgeContracts, shows } from '@/server/db/schema';
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
import { GET as resultsApprovalGET } from '@/app/api/results-approval/[token]/route';
import { GET as judgeContractGET } from '@/app/api/judge-contract/[token]/route';
import { GET as prizeCardPrintGET } from '@/app/api/prize-cards/[showId]/print/route';

/**
 * Bug hunt 2026-09-22: three routes serve hand-built HTML from our own
 * origin and interpolated user-typed values raw. A dog name, show name or
 * secretary note — or a crafted URL — could run script in the viewer's
 * logged-in session. Everything now goes through src/lib/html-escape.ts.
 */
const PAYLOAD = '<img src=x onerror=alert(1)>';
const ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';

describe('HTML pages served from our origin escape user-typed values', () => {
  it('results approval page: a dog registered with markup in its name renders as text', async () => {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
    const judge = await makeJudge({ contactEmail: 'j@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const steward = await makeUser({ role: 'steward' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await testDb.update(dogs).set({ registeredName: PAYLOAD }).where(eq(dogs.id, dog.id));
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    await makeResult({ entryClassId: ec.id, placement: 1, recordedBy: steward.id });
    await createTestCaller(steward).steward.submitForJudgeApproval({ showId: show.id, judgeId: judge.id });
    const ja = await testDb.query.judgeAssignments.findFirst({
      where: and(eq(judgeAssignments.showId, show.id), eq(judgeAssignments.judgeId, judge.id)),
    });
    const token = ja!.approvalToken!;

    const res = await resultsApprovalGET(
      new NextRequest(`http://localhost/api/results-approval/${token}`),
      { params: Promise.resolve({ token }) },
    );
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain(PAYLOAD);
    expect(body).toContain(ESCAPED);
    // The page's own markup is intact (not double-escaped).
    expect(body).toContain('<table class="class-table">');
    expect(body).not.toContain('&lt;tr&gt;');
  });

  it('judge contract page: a show name and secretary note with markup render as text', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    await testDb.update(shows).set({ name: `Spring ${PAYLOAD} Show` }).where(eq(shows.id, show.id));
    const judge = await makeJudge({ contactEmail: 'j@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const contract = await createTestCaller(user).secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'j@test.local',
    });
    await testDb.update(judgeContracts).set({ notes: `<script>alert(2)</script>` }).where(eq(judgeContracts.id, contract.id));
    const token = contract.offerToken!;

    const res = await judgeContractGET(
      new NextRequest(`http://localhost/api/judge-contract/${token}`),
      { params: Promise.resolve({ token }) },
    );
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain(PAYLOAD);
    expect(body).toContain(ESCAPED);
    expect(body).not.toContain('<script>alert(2)</script>');
    expect(body).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  });

  it('prize-card print wrapper: a crafted show id cannot break out of the iframe attribute', async () => {
    const evil = 'x"><img src=x onerror=alert(3)>';
    const res = await prizeCardPrintGET(
      new NextRequest('http://localhost/api/prize-cards/x/print?judge=a%22b'),
      { params: Promise.resolve({ showId: evil }) },
    );
    const body = await res.text();
    expect(body).not.toContain('"><img');
    expect(body).not.toContain('<img src=x');
    expect(body).toContain('<iframe id="pdfFrame" src="/api/prize-cards/x%22%3E%3Cimg');
  });
});
