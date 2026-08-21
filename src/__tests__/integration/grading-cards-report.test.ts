import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// Real react-pdf render (no mock) — asserting the actual PDF a real WUSV
// show would produce, not just auth/response shape. See sv-results-report.test.ts
// for the sibling pattern this follows.
vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

import { auth } from '@/lib/auth';
import { GET as reportsGET } from '@/app/api/reports/[showId]/[type]/route';
import { NextRequest } from 'next/server';
import { testDb } from '../helpers/db';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeUser,
  makeOrder,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';
import * as schema from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { loadGradingCardsData } from '@/server/services/grading-cards-data';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const reportParams = (showId: string, type: string) => ({ params: Promise.resolve({ showId, type }) });
const req = (showId: string) => new NextRequest(`http://localhost/api/reports/${showId}/x`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function entry(opts: {
  showId: string;
  exhibitorId: string;
  dogId: string;
  orderId: string;
  catalogueNumber: string;
}) {
  const [row] = await testDb
    .insert(schema.entries)
    .values({
      showId: opts.showId,
      dogId: opts.dogId,
      exhibitorId: opts.exhibitorId,
      orderId: opts.orderId,
      status: 'confirmed',
      catalogueNumber: opts.catalogueNumber,
      totalFee: 2000,
    })
    .returning();
  return row!;
}

async function entryClass(entryId: string, showClassId: string) {
  const [row] = await testDb
    .insert(schema.entryClasses)
    .values({ entryId, showClassId, fee: 2000 })
    .returning();
  return row!;
}

describe('GET /api/reports/[showId]/grading-cards', () => {
  it('rejects an rkc show with 400, quoting the WUSV-only gate', async () => {
    const { user, org } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, showRuleset: 'rkc', status: 'entries_open' });
    authedAs(user);

    const res = await reportsGET(req(show.id), reportParams(show.id, 'grading-cards'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Grading cards are only available for regional (WUSV) shows.');
  });

  it('renders a real 2-page-per-dog PDF for a wusv show with 2 dogs', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({
      organisationId: org.id,
      showRuleset: 'wusv',
      showScope: 'single_breed',
      breedId: breed.id,
      status: 'entries_open',
    });
    const workingDef = await makeClassDef({ name: 'SV Working', type: 'sv_age' });
    const showClass = await makeShowClass({ showId: show.id, classDefinitionId: workingDef.id, breedId: breed.id });

    const anton = await makeDog({
      ownerId: exhibitor.id,
      breedId: breed.id,
      registeredName: 'Anton Vom Haus Garyn',
      sex: 'dog',
      coatType: 'stock',
      kcRegNumber: 'SZ2386790',
      microchipNumber: '985111001532779',
    });
    const bailey = await makeDog({
      ownerId: exhibitor.id,
      breedId: breed.id,
      registeredName: 'Bailey Vom Springberg',
      sex: 'bitch',
      coatType: 'long_stock',
    });

    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const eAnton = await entry({ showId: show.id, exhibitorId: exhibitor.id, dogId: anton.id, orderId: order.id, catalogueNumber: '2' });
    await entryClass(eAnton.id, showClass.id);
    const eBailey = await entry({ showId: show.id, exhibitorId: exhibitor.id, dogId: bailey.id, orderId: order.id, catalogueNumber: '1' });
    await entryClass(eBailey.id, showClass.id);

    const judge = await makeJudge({ name: 'Peter Schorling' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });

    authedAs(user);
    const res = await reportsGET(req(show.id), reportParams(show.id, 'grading-cards'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buffer = Buffer.from(await res.arrayBuffer());
    const pdf = await PDFDocument.load(buffer);
    // 2 dogs × 2 pages each (outside cover + inside details/grading).
    expect(pdf.getPageCount()).toBe(4);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(595.28, 1);
      expect(height).toBeCloseTo(419.53, 1);
    }
  });

  /**
   * North East GSD Regional Group, caught by Mandy proofing before print
   * (2026-08-21). A single-breed regional records its breed judge with NO
   * breed_id and only a sex, and its Junior Handling judge with neither. The
   * grading cards kept their own flat breed -> judge map, so all three
   * assignments collided on the null key and the last one written won: Mandy
   * (Junior Handling, added two days later) replaced Nikki Farley on every card
   * in the show, Baby Puppy included.
   */
  it('prints the breed judge, not the Junior Handling judge, when neither carries a breed', async () => {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({
      organisationId: org.id,
      showRuleset: 'wusv',
      showScope: 'single_breed',
      breedId: breed.id,
      status: 'entries_open',
    });
    const babyPuppyDef = await makeClassDef({ name: 'Baby Puppy', type: 'sv_age' });
    // breedId deliberately absent and sex set — the real shape on a
    // single-breed regional's classes.
    const showClass = await makeShowClass({ showId: show.id, classDefinitionId: babyPuppyDef.id });
    await testDb
      .update(schema.showClasses)
      .set({ sex: 'bitch' })
      .where(eq(schema.showClasses.id, showClass.id));

    const gertie = await makeDog({
      ownerId: exhibitor.id,
      breedId: breed.id,
      registeredName: 'Sadrias Gertie',
      sex: 'bitch',
      coatType: 'long_stock',
    });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const e = await entry({ showId: show.id, exhibitorId: exhibitor.id, dogId: gertie.id, orderId: order.id, catalogueNumber: '2' });
    await entryClass(e.id, showClass.id);

    const nikki = await makeJudge({ name: 'Nikki Farley' });
    await makeJudgeAssignment({ showId: show.id, judgeId: nikki.id, sex: 'dog' });
    await makeJudgeAssignment({ showId: show.id, judgeId: nikki.id, sex: 'bitch' });
    // The Junior Handling judge: no breed, no sex. Added LAST, as it was in prod.
    const jhJudge = await makeJudge({ name: 'Mandy McAteer' });
    await makeJudgeAssignment({ showId: show.id, judgeId: jhJudge.id, sex: null });

    const data = await loadGradingCardsData(testDb, show.id);
    expect(data).not.toBeNull();
    expect(data!.entries).toHaveLength(1);
    expect(data!.entries[0].judgeName).toBe('Nikki Farley');
    expect(data!.entries[0].judgeName).not.toBe('Mandy McAteer');
  });
});
