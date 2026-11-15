/**
 * The judge's accept page shows the stored terms and, on an RKC open or
 * championship show, asks "Have you already agreed to judge {breed} anywhere before the date of
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

async function offer(opts: { showType?: 'open' | 'championship' | 'limited'; showRuleset?: 'rkc' | 'wusv' } = {}) {
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

  it('RKC championship: the stored Level 4 terms, then the question', async () => {
    const { token, breed } = await offer({ showType: 'championship' });
    const page = await (await GET(getReq(token), params(token))).text();
    const terms = judgeOfferTerms({ showType: 'championship', showRuleset: 'rkc', breedNames: [breed.name] })!;
    expect(page).toContain(F121B);
    for (const t of terms.societyTerms) expect(page).toContain(escapeHtml(t));
    expect(page).toContain('Level 4 or above');
    expect(page).toContain(escapeHtml(terms.alreadyAgreedQuestion!));
    expect(page).toContain('name="alreadyAgreed"');
  });

  it('RKC limited show: the invitation wording and no question', async () => {
    const { token } = await offer({ showType: 'limited' });
    const page = await (await GET(getReq(token), params(token))).text();
    expect(page).toContain(F121B);
    expect(page).not.toContain('Judges Education Programme');
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

  it('an RKC championship asks the question: no answer is refused, No accepts', async () => {
    const { token, contract } = await offer({ showType: 'championship' });
    const refused = await POST(postReq(token, { action: 'accept' }), params(token));
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain('Please answer this question by choosing No or Yes.');
    expect((await contractRow(contract.id)).stage).toBe('offer_sent');

    const res = await POST(postReq(token, { action: 'accept', alreadyAgreed: 'no' }), params(token));
    expect(res.status).toBe(200);
    const row = await contractRow(contract.id);
    expect(row.stage).toBe('offer_accepted');
    expect(row.alreadyAgreedElsewhere).toBe(false);
  });

  it('an RKC limited show accepts with no question', async () => {
    const { token, contract } = await offer({ showType: 'limited' });
    const res = await POST(postReq(token, { action: 'accept' }), params(token));
    expect(res.status).toBe(200);
    const row = await contractRow(contract.id);
    expect(row.stage).toBe('offer_accepted');
    expect(row.alreadyAgreedElsewhere).toBeNull();
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

describe('a missing answer always reaches the server, which says what is wrong', () => {
  // Mandy, 15 Nov 2026, on the demo: "it wont let me hit accept". The No radio
  // carried `required` but the radios are visually hidden, so the browser's own
  // check blocked Accept with a tiny bubble (on some phones, nothing at all) and
  // no POST was ever sent. `novalidate` lets the server's clear message show;
  // the #already-agreed fragment lands the reloaded page on the question.
  const acceptForm = (page: string) => page.match(/<form class="accept-form"[^>]*>/)?.[0] ?? '';

  it('GET: the accept form has novalidate and lands back on the question', async () => {
    const { token } = await offer();
    const page = await (await GET(getReq(token), params(token))).text();
    const form = acceptForm(page);
    expect(form).not.toBe('');
    expect(form).toMatch(/\snovalidate[\s>]/);
    expect(form).toContain(`action="/api/judge-contract/${token}#already-agreed"`);
    expect(page).toMatch(/<fieldset[^>]*\sid="already-agreed"/);
  });

  it('POST with no answer: 400, the red message, and the form still lands on the question', async () => {
    const { token } = await offer();
    const res = await POST(postReq(token, { action: 'accept' }), params(token));
    expect(res.status).toBe(400);
    const page = await res.text();
    expect(page).toContain('<p class="error" id="already-agreed-error" role="alert">Please answer this question by choosing No or Yes.</p>');
    const form = acceptForm(page);
    expect(form).toMatch(/\snovalidate[\s>]/);
    expect(form).toContain(`action="/api/judge-contract/${token}#already-agreed"`);
    expect(page).toMatch(/<fieldset[^>]*\sid="already-agreed"/);
  });

  it('the page runs no script (it must work without JavaScript)', async () => {
    const { token } = await offer();
    const page = await (await GET(getReq(token), params(token))).text();
    expect(page).not.toMatch(/<script/i);
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

describe('the accept page shows the same Breed and Classification rows as the offer email', () => {
  async function pageFor(assign: { breedId?: string; sex: 'dog' | 'bitch' | null }[]) {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showType: 'open', showRuleset: 'rkc' });
    const judge = await makeJudge({ contactEmail: 'judge@test.local' });
    for (const a of assign) await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: a.breedId, sex: a.sex });
    const contract = await createTestCaller(user).secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local',
    });
    const t = contract.offerToken;
    const page = await (await GET(getReq(t), params(t))).text();
    return { page, breed };
  }

  it('single-breed show, breed-NULL dog and bitch assignments: the breed and its classes, never "All breeds"', async () => {
    const { page, breed } = await pageFor([{ sex: 'dog' }, { sex: 'bitch' }]);
    expect(page).toMatch(new RegExp(`<td class="label">Breed</td><td>${breed.name}</td>`));
    expect(page).toContain(`<td class="label">Classification</td><td>${breed.name} Dogs &amp; Bitches classes</td>`);
    expect(page).not.toContain('All breeds');
  });

  it('a Junior Handling-only judge shows "Junior Handling" as the classification', async () => {
    const { page } = await pageFor([{ sex: null }]);
    expect(page).toContain('<td class="label">Classification</td><td>Junior Handling</td>');
  });
});

describe('every judge-facing page uses 16px+ body text', () => {
  // Judges are often older and on a phone. Only the small "Powered by Remi"
  // footer may be under 16px. (A browser check was also run at 375px.)
  function smallSizes(page: string): string[] {
    const withoutFooterRule = page.replace(/\.footer \{[^}]*\}/, '');
    return withoutFooterRule.match(/font-size:\s*1[0-5]px/g) ?? [];
  }

  it('offer, refused, decline, accepted and declined pages', async () => {
    const pages: string[] = [];
    const a = await offer();
    pages.push(await (await GET(getReq(a.token), params(a.token))).text());
    pages.push(await (await POST(postReq(a.token, { action: 'accept' }), params(a.token))).text());
    pages.push(await (await GET(new NextRequest(`http://localhost/api/judge-contract/${a.token}?action=decline`), params(a.token))).text());
    pages.push(await (await POST(postReq(a.token, { action: 'accept', alreadyAgreed: 'no' }), params(a.token))).text());
    const b = await offer();
    pages.push(await (await POST(postReq(b.token, { action: 'decline', reason: 'Away' }), params(b.token))).text());
    for (const page of pages) expect(smallSizes(page)).toEqual([]);
  });
});
