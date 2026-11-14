/**
 * The judge's accept page shows the stored terms and, on an RKC open show,
 * asks "Have you already agreed to judge {breed} anywhere before the date of
 * this show?". The server is the gate: an accept without an answer (or Yes
 * with an empty box) is refused and the contract stays offer_sent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { judgeContracts } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { resendMocks } from '../helpers/resend-mocks';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';
import { escapeHtml } from '@/lib/html-escape';
import { judgeOfferTerms } from '@/lib/judge-offer-terms';

// The PDF archive is fire-and-forget on accept; keep it off the network.
vi.mock('@/server/services/judge-contract-pdf', () => ({
  generateJudgeContractPdf: vi.fn(async () => ({ status: 'generated' })),
}));

import { GET, POST } from '@/app/api/judge-contract/[token]/route';

const F121B = 'In accepting this invitation you agree to be bound by Royal Kennel Club Rules and Regulations';

async function offer(opts: { showType?: 'open' | 'championship'; showRuleset?: 'rkc' | 'wusv' } = {}) {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id, breedId: breed.id,
    showType: opts.showType ?? 'open', showRuleset: opts.showRuleset ?? 'rkc',
  });
  const judge = await makeJudge({ contactEmail: 'judge@test.local' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
  const contract = await createTestCaller(user).secretary.sendJudgeOffer({
    showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local',
  });
  return { contract, token: contract.offerToken, breed, show, user };
}

const params = (token: string) => ({ params: Promise.resolve({ token }) });
const getReq = (token: string) => new NextRequest(`http://localhost/api/judge-contract/${token}`);
function postReq(token: string, form: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.append(k, v);
  return new NextRequest(`http://localhost/api/judge-contract/${token}`, { method: 'POST', body: fd });
}
async function contractRow(id: string) {
  return (await testDb.query.judgeContracts.findFirst({ where: eq(judgeContracts.id, id) }))!;
}
function secretaryEmail() {
  const calls = resendMocks.send.mock.calls as unknown as [{ subject: string; html: string }][];
  return calls.map((c) => c[0]).find((e) => e.subject.startsWith('Judge Accepted'));
}

beforeEach(() => resendMocks.send.mockClear());

describe('GET — the accept page', () => {
  it('RKC open show: shows the stored terms in order, then the question with No and Yes', async () => {
    const { token, breed } = await offer();
    const page = await (await GET(getReq(token), params(token))).text();
    const terms = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: [breed.name] })!;
    const order = [
      ...terms.invitationParagraphs,
      ...terms.societyTerms,
      terms.alreadyAgreedQuestion!,
    ].map((t) => page.indexOf(escapeHtml(t)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).toMatch(/type="radio"[^>]*name="alreadyAgreed"[^>]*value="no"/);
    expect(page).toMatch(/type="radio"[^>]*name="alreadyAgreed"[^>]*value="yes"/);
    expect(page).toContain('Please list each show and its date.');
    // The question sits before the Accept button.
    expect(page.indexOf(escapeHtml(terms.alreadyAgreedQuestion!))).toBeLessThan(page.indexOf('Accept Appointment'));
  });

  it('shows what was STORED, not what the owner would say today', async () => {
    const { token, contract } = await offer();
    const stored = (await contractRow(contract.id)).offerTerms!;
    await testDb.update(judgeContracts).set({
      offerTerms: { ...stored, societyTerms: ['A term as it was worded when this offer went out.'] },
    }).where(eq(judgeContracts.id, contract.id));
    const page = await (await GET(getReq(token), params(token))).text();
    expect(page).toContain('A term as it was worded when this offer went out.');
    expect(page).not.toContain('Level 2 or above');
  });

  it('RKC championship: the invitation wording and no question', async () => {
    const { token } = await offer({ showType: 'championship' });
    const page = await (await GET(getReq(token), params(token))).text();
    expect(page).toContain(F121B);
    expect(page).not.toContain('name="alreadyAgreed"');
  });

  it('a contract with NULL terms shows neither terms nor question', async () => {
    const { token, contract } = await offer();
    await testDb.update(judgeContracts).set({ offerTerms: null }).where(eq(judgeContracts.id, contract.id));
    const page = await (await GET(getReq(token), params(token))).text();
    expect(page).not.toContain(F121B);
    expect(page).not.toContain('name="alreadyAgreed"');
  });
});

describe('POST accept — the question is the gate', () => {
  it('no answer: refused, the page says why, and the stage stays offer_sent', async () => {
    const { token, contract } = await offer();
    const res = await POST(postReq(token, { action: 'accept' }), params(token));
    expect(res.status).toBe(400);
    const page = await res.text();
    expect(page).toContain('Please answer this question by choosing No or Yes.');
    const row = await contractRow(contract.id);
    expect(row.stage).toBe('offer_sent');
    expect(row.acceptedAt).toBeNull();
    expect(row.alreadyAgreedElsewhere).toBeNull();
    expect(secretaryEmail()).toBeUndefined();
  });

  it('Yes with an empty box: refused, the stage stays offer_sent, and Yes stays chosen', async () => {
    const { token, contract } = await offer();
    const res = await POST(postReq(token, { action: 'accept', alreadyAgreed: 'yes', alreadyAgreedDetails: '  ' }), params(token));
    expect(res.status).toBe(400);
    const page = await res.text();
    expect(page).toContain('Please list each show and its date in the box.');
    expect(page).toMatch(/value="yes"[^>]*checked/);
    expect((await contractRow(contract.id)).stage).toBe('offer_sent');
  });

  it('a box over 2,000 characters is refused and the text is kept', async () => {
    const { token, contract } = await offer();
    const long = 'Show A, 1 May. '.repeat(140);
    const res = await POST(postReq(token, { action: 'accept', alreadyAgreed: 'yes', alreadyAgreedDetails: long }), params(token));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Show A, 1 May.');
    expect((await contractRow(contract.id)).stage).toBe('offer_sent');
  });

  it('No: accepts and stores "no"; the secretary\'s email says none declared', async () => {
    const { token, contract } = await offer();
    const res = await POST(postReq(token, { action: 'accept', alreadyAgreed: 'no', alreadyAgreedDetails: 'typed then changed' }), params(token));
    expect(res.status).toBe(200);
    const row = await contractRow(contract.id);
    expect(row.stage).toBe('offer_accepted');
    expect(row.alreadyAgreedElsewhere).toBe(false);
    expect(row.alreadyAgreedDetails).toBeNull();
    expect(secretaryEmail()!.html).toContain('Appointments already agreed: none declared');
  });

  it('Yes with text: accepts, stores it, and the secretary\'s email carries it escaped', async () => {
    const { token, contract } = await offer();
    const text = 'Spring Show, 3 May <script>alert(1)</script>';
    const res = await POST(postReq(token, { action: 'accept', alreadyAgreed: 'yes', alreadyAgreedDetails: text }), params(token));
    expect(res.status).toBe(200);
    const row = await contractRow(contract.id);
    expect(row.stage).toBe('offer_accepted');
    expect(row.alreadyAgreedElsewhere).toBe(true);
    expect(row.alreadyAgreedDetails).toBe(text);
    const mail = secretaryEmail()!.html;
    expect(mail).toContain('Spring Show, 3 May &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail).not.toContain('<script>alert(1)</script>');
  });

  it('a NULL-terms contract accepts with no question, exactly as before', async () => {
    const { token, contract } = await offer();
    await testDb.update(judgeContracts).set({ offerTerms: null }).where(eq(judgeContracts.id, contract.id));
    const res = await POST(postReq(token, { action: 'accept' }), params(token));
    expect(res.status).toBe(200);
    const row = await contractRow(contract.id);
    expect(row.stage).toBe('offer_accepted');
    expect(row.alreadyAgreedElsewhere).toBeNull();
    expect(secretaryEmail()!.html).not.toContain('Appointments already agreed');
  });

  it('an RKC championship accepts with no question', async () => {
    const { token, contract } = await offer({ showType: 'championship' });
    const res = await POST(postReq(token, { action: 'accept' }), params(token));
    expect(res.status).toBe(200);
    expect((await contractRow(contract.id)).stage).toBe('offer_accepted');
  });

  it('decline is unchanged: no answer needed', async () => {
    const { token, contract } = await offer();
    const res = await POST(postReq(token, { action: 'decline', reason: 'Away that weekend' }), params(token));
    expect(res.status).toBe(200);
    const row = await contractRow(contract.id);
    expect(row.stage).toBe('declined');
    expect(row.alreadyAgreedElsewhere).toBeNull();
  });
});

describe('the secretary sees the answer before confirming', () => {
  it('getJudgeContracts and getChecklistJudgeSummary both carry it', async () => {
    const { token, show, user, contract } = await offer();
    await POST(postReq(token, { action: 'accept', alreadyAgreed: 'yes', alreadyAgreedDetails: 'Spring Show, 3 May' }), params(token));
    const caller = createTestCaller(user);
    const contracts = await caller.secretary.getJudgeContracts({ showId: show.id });
    expect(contracts.find((c) => c.id === contract.id)).toMatchObject({
      alreadyAgreedElsewhere: true, alreadyAgreedDetails: 'Spring Show, 3 May',
    });
    const summary = await caller.secretary.getChecklistJudgeSummary({ showId: show.id });
    expect(summary.judges.find((j) => j.contractId === contract.id)).toMatchObject({
      alreadyAgreedElsewhere: true, alreadyAgreedDetails: 'Spring Show, 3 May',
    });
  });
});
