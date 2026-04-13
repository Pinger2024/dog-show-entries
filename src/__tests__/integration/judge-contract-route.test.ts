import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { judgeContracts } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';
import {
  GET as judgeContractGET,
  POST as judgeContractPOST,
} from '@/app/api/judge-contract/[token]/route';

async function freshContractToken() {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id });
  const judge = await makeJudge({ contactEmail: 'j@test.local' });
  await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
  const contract = await createTestCaller(user).secretary.sendJudgeOffer({
    showId: show.id, judgeId: judge.id, judgeEmail: 'j@test.local',
  });
  return { contract, show, judge };
}

function getReq(token: string, search = '') {
  return new NextRequest(`http://localhost/api/judge-contract/${token}${search}`);
}

function postReq(token: string, form: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.append(k, v);
  return new NextRequest(`http://localhost/api/judge-contract/${token}`, {
    method: 'POST',
    body: fd,
  });
}

const params = (token: string) => ({ params: Promise.resolve({ token }) });

describe('GET /api/judge-contract/[token]', () => {
  it('returns the offer page (200) for a valid token', async () => {
    const { contract } = await freshContractToken();
    const res = await judgeContractGET(getReq(contract.offerToken!), params(contract.offerToken!));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Judging Appointment Offer');
  });

  it('returns 404 for an unknown token', async () => {
    const res = await judgeContractGET(getReq('not-a-token'), params('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(404);
  });

  it('returns 410 for an expired token', async () => {
    const { contract } = await freshContractToken();
    await testDb.update(judgeContracts).set({
      tokenExpiresAt: new Date(Date.now() - 60_000),
    }).where(eq(judgeContracts.id, contract.id));
    const res = await judgeContractGET(getReq(contract.offerToken!), params(contract.offerToken!));
    expect(res.status).toBe(410);
  });
});

describe('POST /api/judge-contract/[token] accept', () => {
  it('moves the contract to offer_accepted and stamps acceptedAt', async () => {
    const { contract } = await freshContractToken();
    const res = await judgeContractPOST(
      postReq(contract.offerToken!, { action: 'accept' }),
      params(contract.offerToken!),
    );
    expect(res.status).toBe(200);
    const refreshed = await testDb.query.judgeContracts.findFirst({
      where: eq(judgeContracts.id, contract.id),
    });
    expect(refreshed?.stage).toBe('offer_accepted');
    expect(refreshed?.acceptedAt).toBeInstanceOf(Date);
  });

  it('rejects accepting an already-responded contract', async () => {
    const { contract } = await freshContractToken();
    await testDb.update(judgeContracts).set({ stage: 'offer_accepted' })
      .where(eq(judgeContracts.id, contract.id));
    const res = await judgeContractPOST(
      postReq(contract.offerToken!, { action: 'accept' }),
      params(contract.offerToken!),
    );
    expect(res.status).toBe(200); // still HTML 200 but page says already-responded
    const html = await res.text();
    expect(html).toMatch(/Already Responded/i);
  });
});

describe('POST /api/judge-contract/[token] decline', () => {
  it('marks the contract as declined and stamps declinedAt + reason', async () => {
    const { contract } = await freshContractToken();
    const res = await judgeContractPOST(
      postReq(contract.offerToken!, { action: 'decline', reason: 'Schedule conflict' }),
      params(contract.offerToken!),
    );
    expect(res.status).toBe(200);
    const refreshed = await testDb.query.judgeContracts.findFirst({
      where: eq(judgeContracts.id, contract.id),
    });
    expect(refreshed?.stage).toBe('declined');
    expect(refreshed?.declinedAt).toBeInstanceOf(Date);
    expect(refreshed?.expenseNotes).toMatch(/Schedule conflict/);
  });
});

describe('POST /api/judge-contract/[token] error cases', () => {
  it('returns 404 for unknown token', async () => {
    const res = await judgeContractPOST(
      postReq('unknown', { action: 'accept' }),
      params('00000000-0000-0000-0000-000000000000'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 410 for expired token', async () => {
    const { contract } = await freshContractToken();
    await testDb.update(judgeContracts).set({
      tokenExpiresAt: new Date(Date.now() - 60_000),
    }).where(eq(judgeContracts.id, contract.id));
    const res = await judgeContractPOST(
      postReq(contract.offerToken!, { action: 'accept' }),
      params(contract.offerToken!),
    );
    expect(res.status).toBe(410);
  });

  it('returns 400 for unrecognised action', async () => {
    const { contract } = await freshContractToken();
    const res = await judgeContractPOST(
      postReq(contract.offerToken!, { action: 'sneeze' }),
      params(contract.offerToken!),
    );
    expect(res.status).toBe(400);
  });
});
