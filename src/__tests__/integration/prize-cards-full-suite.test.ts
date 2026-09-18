import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// Real react-pdf render (no mock) — asserting the actual PDF a real show
// with mixed judges would produce, not just auth/response shape. Same
// pattern as grading-cards-report.test.ts and sv-results-report.test.ts.
vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

import { auth } from '@/lib/auth';
import { GET as prizeCardsGET } from '@/app/api/prize-cards/[showId]/route';
import { NextRequest } from 'next/server';
import {
  makeSecretaryWithOrgAndBreed,
  makeSecretaryWithOrg,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeUser,
  makeEntry,
  makeEntryClass,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const params = (showId: string) => ({ params: Promise.resolve({ showId }) });
const req = (showId: string) => new NextRequest(`http://localhost/api/prize-cards/${showId}`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// Mandy, 2026-07-30: the prize-cards PDF must contain the FULL SUITE of
// cards (one page per physical card), not one page per placement, and each
// class's cards must carry THAT class's own judge — Special Award Classes
// and Junior-Handling-shaped classes must never silently inherit the breed
// judge (the exact trap judges-book-sac-judge.test.ts guards against).
describe('GET /api/prize-cards/[showId] — full suite, per-class judge attribution', () => {
  it('renders one page per card needed, each carrying its own class\'s judge', async () => {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showScope: 'single_breed', status: 'entries_open' });
    const exhibitor = await makeUser({ role: 'exhibitor' });

    // Sex-specific main judges — breedId left null on the ASSIGNMENT (single-
    // breed shows leave breed implicit on sex-specific judges; see
    // judge-resolution.ts / the old prize-cards route comment this replaced).
    const judgeDog = await makeJudge({ name: 'Hugh De Zutter' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judgeDog.id, sex: 'dog' });
    const judgeBitch = await makeJudge({ name: 'Helen Vardy' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judgeBitch.id, sex: 'bitch' });
    const judgeSac = await makeJudge({ name: 'Ms K Salamon' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judgeSac.id, isSpecialAwardsClassesJudge: true });

    // Dog class: 3 confirmed + 1 withdrawn — needs 1st/2nd/3rd (3 cards),
    // judged by the dog judge. The withdrawn entry must NOT count.
    const ageDef = await makeClassDef({ name: 'Yearling Dog', type: 'age' });
    const classDog = await makeShowClass({ showId: show.id, classDefinitionId: ageDef.id, breedId: breed.id });
    for (let i = 0; i < 3; i++) {
      const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
      const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
      await makeEntryClass({ entryId: entry.id, showClassId: classDog.id });
    }
    const withdrawnDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const withdrawnEntry = await makeEntry({ showId: show.id, dogId: withdrawnDog.id, exhibitorId: exhibitor.id, status: 'withdrawn' });
    await makeEntryClass({ entryId: withdrawnEntry.id, showClassId: classDog.id });

    // Bitch class: 1 confirmed — needs 1st only (1 card), judged by the bitch judge.
    const classBitch = await makeShowClass({ showId: show.id, classDefinitionId: ageDef.id, breedId: breed.id });
    const bitchDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sex: 'bitch' });
    const bitchEntry = await makeEntry({ showId: show.id, dogId: bitchDog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await makeEntryClass({ entryId: bitchEntry.id, showClassId: classBitch.id });

    // Zero-entry class: scheduled, no confirmed entries — contributes nothing.
    await makeShowClass({ showId: show.id, classDefinitionId: ageDef.id, breedId: breed.id });

    // Special Award Class — carries the show's breedId (the real trap shape:
    // a single-breed show's SAC class row is indistinguishable from a breed
    // class by breedId alone) but must resolve to the SAC judge, not
    // judgeDog/judgeBitch. 2 confirmed — needs 1st/2nd (2 cards).
    const sacDef = await makeClassDef({ name: 'Special Award Class - Open', type: 'special' });
    const classSac = await makeShowClass({ showId: show.id, classDefinitionId: sacDef.id, breedId: breed.id });
    for (let i = 0; i < 2; i++) {
      const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
      const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
      await makeEntryClass({ entryId: entry.id, showClassId: classSac.id });
    }

    authedAs(secretary);
    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buffer = Buffer.from(await res.arrayBuffer());
    const pdf = await PDFDocument.load(buffer);

    // Total cards = min(3,4) [dog] + min(1,4) [bitch] + min(0,4) [zero] + min(2,4) [SAC]
    //             = 3 + 1 + 0 + 2 = 6.
    expect(pdf.getPageCount()).toBe(6);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(595.28, 1);
      expect(height).toBeCloseTo(419.53, 1);
    }
  });

  it('renders a single explanatory page when a show has no confirmed entries at all', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });

    authedAs(secretary);
    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('still returns 403 for a secretary from a different organisation', async () => {
    const { org } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    const { user: rivalSecretary } = await makeSecretaryWithOrg();

    authedAs(rivalSecretary);
    const res = await prizeCardsGET(req(show.id), params(show.id));
    expect(res.status).toBe(403);
  });
});
