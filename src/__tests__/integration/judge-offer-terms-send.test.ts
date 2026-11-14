/**
 * Every path that sends a judge's offer stores the standard terms on the
 * contract and the email carries them (src/lib/judge-offer-terms.ts owns the
 * words; src/server/services/judge-offer-email.ts is the one renderer):
 * secretary.sendJudgeOffer, sendBulkJudgeOffers and resendJudgeOffer.
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

// The PDF archive is fire-and-forget on accept; keep it off the network.
vi.mock('@/server/services/judge-contract-pdf', () => ({
  generateJudgeContractPdf: vi.fn(async () => ({ status: 'generated' })),
}));
import { escapeHtml } from '@/lib/html-escape';
import { judgeOfferTerms } from '@/lib/judge-offer-terms';

const F121B = 'In accepting this invitation you agree to be bound by Royal Kennel Club Rules and Regulations';
const LEVEL_2 = 'Level 2 or above';

type ShowOpts = { showType?: 'open' | 'championship' | 'limited' | 'premier_open'; showRuleset?: 'rkc' | 'wusv' };

async function setup(opts: ShowOpts = {}) {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showType: opts.showType ?? 'open',
    showRuleset: opts.showRuleset ?? 'rkc',
  });
  const judge = await makeJudge({ contactEmail: 'judge@test.local' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'dog' });
  return { caller: createTestCaller(user), show, judge, breed };
}

function lastEmail(): { to: unknown; subject: string; html: string } {
  const calls = resendMocks.send.mock.calls as unknown as [{ to: unknown; subject: string; html: string }][];
  return calls[calls.length - 1]![0];
}

async function storedTerms(contractId: string) {
  const row = await testDb.query.judgeContracts.findFirst({ where: eq(judgeContracts.id, contractId) });
  return row!.offerTerms;
}

beforeEach(() => {
  resendMocks.send.mockClear();
});

describe('sendJudgeOffer', () => {
  it('RKC open show: stores the full terms and the email carries them', async () => {
    const { caller, show, judge, breed } = await setup();
    const contract = await caller.secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local',
    });
    const expected = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: [breed.name] })!;
    expect(await storedTerms(contract.id)).toEqual(expected);

    const email = lastEmail();
    expect(email.subject).toBe(`Judging Offer — ${show.name}`);
    for (const p of expected.invitationParagraphs) expect(email.html).toContain(escapeHtml(p));
    for (const t of expected.societyTerms) expect(email.html).toContain(escapeHtml(t));
    expect(email.html).toContain(escapeHtml(expected.alreadyAgreedNotice!));
    expect(email.html).toContain(`this breed (${breed.name})`);
  });

  it('RKC championship: the invitation wording only', async () => {
    const { caller, show, judge } = await setup({ showType: 'championship' });
    const contract = await caller.secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local',
    });
    const stored = (await storedTerms(contract.id)) as { societyTerms: string[] };
    expect(stored.societyTerms).toEqual([]);
    expect(lastEmail().html).toContain(F121B);
    expect(lastEmail().html).not.toContain(LEVEL_2);
  });

  it('regional: stores NULL and the email has no terms', async () => {
    const { caller, show, judge } = await setup({ showType: 'championship', showRuleset: 'wusv' });
    const contract = await caller.secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local',
    });
    expect(await storedTerms(contract.id)).toBeNull();
    expect(lastEmail().html).not.toContain(F121B);
    expect(lastEmail().html).not.toContain(LEVEL_2);
  });

  it('the secretary\'s notes and expense notes arrive escaped', async () => {
    const { caller, show, judge } = await setup();
    await caller.secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local',
      notes: 'Lunch <b>provided</b> <script>alert(1)</script>',
      hotelCost: 5000,
      expenseNotes: '<img src=x onerror=alert(2)>',
    });
    const { html } = lastEmail();
    expect(html).not.toContain('<b>provided</b>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Lunch &lt;b&gt;provided&lt;/b&gt; &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Hotel: £50.00');
  });
});

describe('sendBulkJudgeOffers', () => {
  it('RKC open show: stores the terms and the email carries them, with the breed and classification lines', async () => {
    const { caller, show, judge, breed } = await setup();
    const res = await caller.secretary.sendBulkJudgeOffers({ showId: show.id, judgeIds: [judge.id] });
    expect(res.sent).toBe(1);
    const contract = await testDb.query.judgeContracts.findFirst({ where: eq(judgeContracts.judgeId, judge.id) });
    const expected = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: [breed.name] })!;
    expect(contract!.offerTerms).toEqual(expected);

    const { html, subject } = lastEmail();
    expect(subject).toBe(`Judging Offer — ${show.name}`);
    for (const t of expected.societyTerms) expect(html).toContain(escapeHtml(t));
    expect(html).toContain(F121B);
    expect(html).toContain('Classification');
    expect(html).toContain(`${breed.name} Dogs classes`);
  });

  it('regional: stores NULL and the email has no terms', async () => {
    const { caller, show, judge } = await setup({ showType: 'championship', showRuleset: 'wusv' });
    await caller.secretary.sendBulkJudgeOffers({ showId: show.id, judgeIds: [judge.id] });
    const contract = await testDb.query.judgeContracts.findFirst({ where: eq(judgeContracts.judgeId, judge.id) });
    expect(contract!.offerTerms).toBeNull();
    expect(lastEmail().html).not.toContain(F121B);
    expect(lastEmail().html).not.toContain(LEVEL_2);
  });
});

describe('resendJudgeOffer', () => {
  it('re-stores the terms it sends (an offer sent before the terms existed gets them)', async () => {
    const { caller, show, judge, breed } = await setup();
    const contract = await caller.secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local',
      notes: 'Please <b>park</b> at the back', hotelCost: 4000,
    });
    await testDb.update(judgeContracts).set({ offerTerms: null }).where(eq(judgeContracts.id, contract.id));
    resendMocks.send.mockClear();

    await caller.secretary.resendJudgeOffer({ contractId: contract.id });

    const expected = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: [breed.name] })!;
    expect(await storedTerms(contract.id)).toEqual(expected);
    const { html, subject } = lastEmail();
    expect(subject).toBe(`Reminder: Judging Offer — ${show.name}`);
    for (const t of expected.societyTerms) expect(html).toContain(escapeHtml(t));
    // The reminder used to drop the notes and expenses already on the contract.
    expect(html).toContain('Please &lt;b&gt;park&lt;/b&gt; at the back');
    expect(html).toContain('Hotel: £40.00');
  });

  it('regional: stores NULL and the reminder has no terms', async () => {
    const { caller, show, judge } = await setup({ showType: 'championship', showRuleset: 'wusv' });
    const contract = await caller.secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local',
    });
    await caller.secretary.resendJudgeOffer({ contractId: contract.id });
    expect(await storedTerms(contract.id)).toBeNull();
    expect(lastEmail().html).not.toContain(F121B);
  });
});

describe('an open-show appointment that names no breed (Junior Handling only)', () => {
  it('stores the invitation wording with no Society terms and no question; the judge accepts with no answer', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showType: 'open', showRuleset: 'rkc' });
    const judge = await makeJudge({ contactEmail: 'jh@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, sex: null }); // Junior Handling
    const contract = await createTestCaller(user).secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'jh@test.local',
    });
    const stored = (await storedTerms(contract.id)) as { societyTerms: string[]; alreadyAgreedQuestion: string | null };
    expect(stored.societyTerms).toEqual([]);
    expect(stored.alreadyAgreedQuestion).toBeNull();
    expect(lastEmail().html).toContain(F121B);
    expect(lastEmail().html).not.toContain(LEVEL_2);

    const { POST } = await import('@/app/api/judge-contract/[token]/route');
    const fd = new FormData();
    fd.append('action', 'accept');
    const res = await POST(
      new NextRequest(`http://localhost/api/judge-contract/${contract.offerToken}`, { method: 'POST', body: fd }),
      { params: Promise.resolve({ token: contract.offerToken }) },
    );
    expect(res.status).toBe(200);
    const row = await testDb.query.judgeContracts.findFirst({ where: eq(judgeContracts.id, contract.id) });
    expect(row!.stage).toBe('offer_accepted');
    expect(row!.alreadyAgreedElsewhere).toBeNull();
  });
});
