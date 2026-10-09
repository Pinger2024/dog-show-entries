import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// Real react-pdf render (no mock), same pattern as grading-cards-report.test.ts.
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
import { loadResultsSheetData } from '@/server/services/results-sheet-data';

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
  dogId: string | null;
  orderId: string;
  catalogueNumber: string | null;
  status?: 'confirmed' | 'withdrawn';
  entryType?: 'standard' | 'junior_handler';
}) {
  const [row] = await testDb
    .insert(schema.entries)
    .values({
      showId: opts.showId,
      dogId: opts.dogId,
      exhibitorId: opts.exhibitorId,
      orderId: opts.orderId,
      status: opts.status ?? 'confirmed',
      entryType: opts.entryType ?? 'standard',
      catalogueNumber: opts.catalogueNumber,
      totalFee: 2000,
    })
    .returning();
  return row!;
}

async function entryClass(entryId: string, showClassId: string) {
  await testDb.insert(schema.entryClasses).values({ entryId, showClassId, fee: 2000 });
}

/** A small regional: Minor Puppy Bitch (long), Junior Bitch (long), JH, with
 *  classes inserted OUT of running order so the sort is really tested. */
async function regional(customAwards?: string[]) {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const show = await makeShow({
    organisationId: org.id,
    name: 'Sample Regional',
    showRuleset: 'wusv',
    showScope: 'single_breed',
    showType: 'championship',
    breedId: breed.id,
    status: 'entries_open',
    ...(customAwards ? { scheduleData: { bestAwards: customAwards } } : {}),
  });
  const def = async (name: string, type: 'sv_age' | 'junior_handler') =>
    (await testDb.query.classDefinitions.findFirst({ where: eq(schema.classDefinitions.name, name) })) ??
    (await makeClassDef({ name, type }));
  const puppyDef = await def('SV Minor Puppy', 'sv_age');
  const juniorDef = await def('SV Junior', 'sv_age');
  const jhDef = await def('Junior Handling', 'junior_handler');
  // Inserted Junior first, JH second, puppy last — sortOrder says otherwise.
  const junior = await makeShowClass({ showId: show.id, classDefinitionId: juniorDef.id, sortOrder: 2, sex: 'bitch', svCoatType: 'long_stock' });
  const jh = await makeShowClass({ showId: show.id, classDefinitionId: jhDef.id, sortOrder: 3 });
  const puppy = await makeShowClass({ showId: show.id, classDefinitionId: puppyDef.id, sortOrder: 1, sex: 'bitch', svCoatType: 'long_stock' });
  const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
  return { user, org, breed, exhibitor, show, order, junior, jh, puppy };
}

describe('GET /api/reports/[showId]/results-sheet', () => {
  it('rejects an rkc show with 400', async () => {
    const { user, org } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, showRuleset: 'rkc', status: 'entries_open' });
    authedAs(user);
    const res = await reportsGET(req(show.id), reportParams(show.id, 'results-sheet'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('The results sheet is only available for regional shows.');
  });

  it('renders an A4 LANDSCAPE PDF for a wusv show', async () => {
    const f = await regional();
    const dog = await makeDog({ ownerId: f.exhibitor.id, breedId: f.breed.id, registeredName: 'Anton Vom Haus', sex: 'bitch', coatType: 'long_stock' });
    const e = await entry({ showId: f.show.id, exhibitorId: f.exhibitor.id, dogId: dog.id, orderId: f.order.id, catalogueNumber: '1' });
    await entryClass(e.id, f.puppy.id);
    authedAs(f.user);
    const res = await reportsGET(req(f.show.id), reportParams(f.show.id, 'results-sheet'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const pdf = await PDFDocument.load(Buffer.from(await res.arrayBuffer()));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(841.89, 1);
      expect(height).toBeCloseTo(595.28, 1);
    }
  });
});

describe('loadResultsSheetData', () => {
  it('lists classes in running order and dogs in ring-number order; JH shows the handler; unpaid and withdrawn are left out; absent stays', async () => {
    const f = await regional();
    const mk = (name: string) => makeDog({ ownerId: f.exhibitor.id, breedId: f.breed.id, registeredName: name, sex: 'bitch', coatType: 'long_stock' });
    const [d10, d9, d2, dW, dU, dAbs] = await Promise.all(['Ten Dog', 'Nine Dog', 'Two Dog', 'Withdrawn Dog', 'Unpaid Dog', 'Absent Dog'].map(mk));
    const add = async (dog: typeof d10, cat: string, cls: { id: string }, extra: { orderId?: string; status?: 'confirmed' | 'withdrawn' } = {}) => {
      const e = await entry({ showId: f.show.id, exhibitorId: f.exhibitor.id, dogId: dog!.id, orderId: extra.orderId ?? f.order.id, catalogueNumber: cat, status: extra.status });
      await entryClass(e.id, cls.id);
      return e;
    };
    await add(d10, '10', f.puppy);
    await add(d9, '9', f.puppy);
    await add(d2, '2', f.puppy);
    await add(dW, '3', f.puppy, { status: 'withdrawn' });
    const pending = await makeOrder({ showId: f.show.id, exhibitorId: f.exhibitor.id, status: 'pending_payment' });
    await add(dU, '4', f.puppy, { orderId: pending.id });
    const eAbs = await add(dAbs, '5', f.junior);
    await testDb.update(schema.entryClasses).set({ absent: true });
    void eAbs;

    const jhEntry = await entry({ showId: f.show.id, exhibitorId: f.exhibitor.id, dogId: null, orderId: f.order.id, catalogueNumber: '60', entryType: 'junior_handler' });
    await entryClass(jhEntry.id, f.jh.id);
    await testDb.insert(schema.juniorHandlerDetails).values({ entryId: jhEntry.id, handlerName: 'Grace-Jane Wotton', dateOfBirth: '2012-03-04' });

    const judge = await makeJudge({ name: 'Peter Schorling' });
    await makeJudgeAssignment({ showId: f.show.id, judgeId: judge.id, sex: 'bitch' });
    const jhJudge = await makeJudge({ name: 'Mandy McAteer' });
    await makeJudgeAssignment({ showId: f.show.id, judgeId: jhJudge.id, sex: null });

    const data = await loadResultsSheetData(testDb, f.show.id);
    expect(data).not.toBeNull();
    expect(data!.showName).toContain('Sample Regional');
    expect(data!.judges).toEqual(['Peter Schorling']);
    expect(data!.jhJudges).toEqual(['Mandy McAteer']);

    // Running order: puppy (1), junior (2), JH (3) — not insertion order.
    expect(data!.blocks.map((b) => b.showClassId)).toEqual([f.puppy.id, f.junior.id, f.jh.id]);
    const [puppy, junior, jh] = data!.blocks;
    expect(puppy!.rows.map((r) => r.ringNumber)).toEqual(['2', '9', '10']);
    expect(puppy!.rows.map((r) => r.name)).toEqual(['Two Dog', 'Nine Dog', 'Ten Dog']);
    expect(puppy!.measured).toBe(false);
    expect(junior!.measured).toBe(true);
    expect(junior!.rows.map((r) => r.name)).toEqual(['Absent Dog']);
    expect(junior!.rows[0]!.absent).toBe(true);
    expect(jh!.label).toBe('JHA');
    expect(jh!.isJuniorHandling).toBe(true);
    expect(jh!.rows.map((r) => r.name)).toEqual(['Grace-Jane Wotton']);
    // The band text is the catalogue's class heading.
    expect(puppy!.heading).toMatch(/Minor Puppy Bitch/);
    expect(puppy!.heading).toMatch(/Long Coat/);
  });

  it('award rows come from buildBestAwards with Male/Female labels, honouring a configured list', async () => {
    const f = await regional();
    let data = await loadResultsSheetData(testDb, f.show.id);
    const labels = data!.awards.map((a) => a.label);
    expect(labels).toContain('Best Male');
    expect(labels).toContain('Best Female');
    expect(labels).not.toContain('Best Dog');

    const g = await regional(['Best Dog', 'Best in Show']);
    data = await loadResultsSheetData(testDb, g.show.id);
    expect(data!.awards.map((a) => a.label)).toEqual(['Best Male', 'Best in Show']);
  });

  it('GUARD: every dog that has a grading card has a row on the results sheet', async () => {
    const f = await regional();
    const names = ['Alpha', 'Bravo', 'Charlie'];
    for (const [i, n] of names.entries()) {
      const dog = await makeDog({ ownerId: f.exhibitor.id, breedId: f.breed.id, registeredName: n, sex: 'bitch', coatType: 'long_stock' });
      const e = await entry({ showId: f.show.id, exhibitorId: f.exhibitor.id, dogId: dog.id, orderId: f.order.id, catalogueNumber: String(i + 1) });
      await entryClass(e.id, i === 2 ? f.junior.id : f.puppy.id);
    }
    const cards = await loadGradingCardsData(testDb, f.show.id);
    const sheet = await loadResultsSheetData(testDb, f.show.id);
    const onSheet = new Set(sheet!.blocks.flatMap((b) => b.rows.map((r) => r.name)));
    expect(cards!.entries.length).toBe(3);
    for (const c of cards!.entries) expect(onSheet.has(c.dogName)).toBe(true);
  });
});
