/**
 * The contract PDF carries the standard terms exactly as stored on the
 * contract when the offer was sent, and the judge's answer about appointments
 * already agreed. A regional (or an offer sent before the terms existed) has
 * no terms section and its PDF is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { judgeContracts } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';
import { judgeOfferTerms } from '@/lib/judge-offer-terms';
import type { JudgeContractPdfData } from '@/components/judge-contract/judge-contract-pdf';

const rendered: ReactElement[] = [];
vi.mock('@react-pdf/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-pdf/renderer')>();
  return {
    ...actual,
    renderToBuffer: vi.fn(async (el: ReactElement) => {
      rendered.push(el);
      return Buffer.from('%PDF-1.4 test');
    }),
  };
});
vi.mock('@/server/services/storage', () => ({
  uploadToR2: vi.fn(async () => undefined),
}));

import { generateJudgeContractPdf } from '@/server/services/judge-contract-pdf';

const F121B = 'In accepting this invitation you agree to be bound by Royal Kennel Club Rules and Regulations';

/** Every string the PDF tree would print (function components expanded). */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === 'function') {
      return textOf((el.type as (p: unknown) => ReactNode)(el.props));
    }
    return textOf(el.props.children);
  }
  return '';
}

async function acceptedContract(opts: {
  showType?: 'open' | 'championship';
  showRuleset?: 'rkc' | 'wusv';
  answer?: { alreadyAgreedElsewhere: boolean | null; alreadyAgreedDetails: string | null };
} = {}) {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id, breedId: breed.id,
    showType: opts.showType ?? 'open', showRuleset: opts.showRuleset ?? 'rkc',
  });
  const judge = await makeJudge({ contactEmail: 'judge@test.local' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
  const contract = await createTestCaller(user).secretary.sendJudgeOffer({
    showId: show.id, judgeId: judge.id, judgeEmail: 'judge@test.local', notes: 'Lunch provided',
  });
  await testDb.update(judgeContracts).set({
    stage: 'offer_accepted',
    acceptedAt: new Date(),
    ...(opts.answer ?? {}),
  }).where(eq(judgeContracts.id, contract.id));
  return { contract, breed };
}

async function pdfFor(contractId: string) {
  rendered.length = 0;
  const res = await generateJudgeContractPdf(contractId);
  expect(res.status).toBe('generated');
  const el = rendered[0] as ReactElement<{ data: JudgeContractPdfData }>;
  return { data: el.props.data, text: textOf(el) };
}

beforeEach(() => {
  rendered.length = 0;
});

describe('contract PDF — standard terms', () => {
  it('RKC open show: the data carries the stored terms and a Yes answer; the PDF prints them', async () => {
    const { contract, breed } = await acceptedContract({
      answer: { alreadyAgreedElsewhere: true, alreadyAgreedDetails: 'Spring Show, 3 May' },
    });
    const { data, text } = await pdfFor(contract.id);
    const expected = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: [breed.name] })!;
    expect(data.standardTerms).toEqual(expected);
    expect(data.alreadyAgreed).toBe('Spring Show, 3 May');

    expect(text).toContain('Terms of this appointment');
    for (const p of expected.invitationParagraphs) expect(text).toContain(p);
    for (const t of expected.societyTerms) expect(text).toContain(t);
    expect(text).toContain('Appointments already agreed');
    expect(text).toContain('Spring Show, 3 May');
    // The secretary's notes still print as Additional Terms.
    expect(text).toContain('Additional Terms');
    expect(text).toContain('Lunch provided');
  });

  it('a No answer prints "None declared"', async () => {
    const { contract } = await acceptedContract({
      answer: { alreadyAgreedElsewhere: false, alreadyAgreedDetails: null },
    });
    const { data, text } = await pdfFor(contract.id);
    expect(data.alreadyAgreed).toBe('None declared');
    expect(text).toContain('None declared');
  });

  it('prints the STORED terms, not what the owner would say today', async () => {
    const { contract } = await acceptedContract({
      answer: { alreadyAgreedElsewhere: false, alreadyAgreedDetails: null },
    });
    const row = await testDb.query.judgeContracts.findFirst({ where: eq(judgeContracts.id, contract.id) });
    await testDb.update(judgeContracts).set({
      offerTerms: { ...row!.offerTerms!, societyTerms: ['A term as it was worded then.'] },
    }).where(eq(judgeContracts.id, contract.id));
    const { text } = await pdfFor(contract.id);
    expect(text).toContain('A term as it was worded then.');
    expect(text).not.toContain('Level 2 or above');
  });

  it('RKC championship: the invitation wording, no numbered terms, no answer row', async () => {
    const { contract } = await acceptedContract({ showType: 'championship' });
    const { data, text } = await pdfFor(contract.id);
    expect(data.standardTerms?.societyTerms).toEqual([]);
    expect(data.alreadyAgreed).toBeNull();
    expect(text).toContain(F121B);
    expect(text).not.toContain('Level 2 or above');
    expect(text).not.toContain('Appointments already agreed');
  });

  it('regional: no terms in the data and none in the PDF', async () => {
    const { contract } = await acceptedContract({ showType: 'championship', showRuleset: 'wusv' });
    const { data, text } = await pdfFor(contract.id);
    expect(data.standardTerms).toBeNull();
    expect(data.alreadyAgreed).toBeNull();
    expect(JSON.stringify(data)).not.toContain('Royal Kennel Club Rules and Regulations');
    expect(text).not.toContain('Terms of this appointment');
    expect(text).not.toContain(F121B);
  });

  it('an offer sent before the terms existed (NULL) prints no terms section', async () => {
    const { contract } = await acceptedContract();
    await testDb.update(judgeContracts).set({ offerTerms: null }).where(eq(judgeContracts.id, contract.id));
    const { data, text } = await pdfFor(contract.id);
    expect(data.standardTerms).toBeNull();
    expect(text).not.toContain('Terms of this appointment');
  });
});
