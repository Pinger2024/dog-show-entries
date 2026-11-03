/**
 * Winter Spectacular 2026 catalogue (Mandy, 3 Nov 2026, Telegram 8184/8185):
 *  1. "It's putting the junior handling judge first in the catalogue rather
 *     than the main judge, the first judge should be Sami, and also his
 *     affix isn't pulling through."
 *  2. "The catalogue isn't picking up the awards from the schedule settings."
 *
 * Cause 1: the catalogue builds its judge list in lib/schedule-judges.ts, a
 * separate copy from the schedule's. It only counted a judge as Junior
 * Handling with a no-breed AND no-sex assignment, so Lynne — whose Junior
 * Handling is also recorded against the breed — read as a breed judge and
 * sorted alphabetically ahead of Sami; and it never read the affix. The
 * breed → judge map was built from any row with a breed, so it named Lynne
 * the German Shepherd judge.
 * Cause 2: the regional catalogue printed four fixed lines instead of the
 * secretary's awards text.
 *
 * Data shaped like the live show (demo copy of prod, 3 Nov): Sami Baggstrom
 * (Sensen Mann) — Dogs + Bitches, no breed; Lynne Harvey (Muscava) — one row
 * against the breed with no sex, one with neither.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/impersonation', () => ({ getImpersonatedUserId: vi.fn(async () => null) }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null), signIn: vi.fn(), signOut: vi.fn() }));

import { db } from '@/server/db';
import { shows, judges, judgeAssignments } from '@/server/db/schema';
import { cleanDb } from '../helpers/db';
import { loadShowFixture } from '../helpers/show-fixture';
import { buildCatalogueSnapshot, renderCatalogueFromSnapshot } from '@/server/services/catalogue-snapshot';
import type { ShowFixture } from '../../../scripts/lib/export-show-fixture-core';

const AWARDS = [
  'Trophies for first place',
  'Rosettes to third place',
  'Grading cards for all dogs presented',
  'Annual Awards and Gold Medal Points for BRG Members',
  'Goody Bags for Junior Handlers',
].join('\n');

function pdfText(buffer: Buffer): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'catalogue-judges-'));
  const p = path.join(dir, 'doc.pdf');
  writeFileSync(p, buffer);
  return execFileSync('pdftotext', ['-layout', p, '-']).toString('utf8');
}

async function winterSpectacular(opts: { withPureJhRow: boolean }) {
  await cleanDb();
  const fixture = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'golden', 'fixtures', 'winter-spectacular-2026.json'), 'utf8'),
  ) as ShowFixture;
  const { showId } = await loadShowFixture(db, fixture);
  const rows = await db.query.judgeAssignments.findMany({ where: eq(judgeAssignments.showId, showId) });
  const bySex = rows.find((r) => r.sex === 'dog')!;
  const lynneRow = rows.find((r) => r.breedId && !r.sex)!;
  await db.update(judges).set({ name: 'Sami Baggstrom', kennelClubAffix: 'Sensen Mann' }).where(eq(judges.id, bySex.judgeId));
  await db.update(judges).set({ name: 'Lynne Harvey', kennelClubAffix: 'Muscava' }).where(eq(judges.id, lynneRow.judgeId));
  if (opts.withPureJhRow) {
    await db.insert(judgeAssignments).values({ showId, judgeId: lynneRow.judgeId, breedId: null, sex: null });
  }
  const show = (await db.query.shows.findFirst({ where: eq(shows.id, showId) }))!;
  await db.update(shows).set({ scheduleData: { ...(show.scheduleData ?? {}), awardsDescription: AWARDS } }).where(eq(shows.id, showId));
  return showId;
}

describe('Winter Spectacular catalogue — judges and awards', () => {
  beforeAll(async () => { await cleanDb(); });

  it.each([true, false])('the main judge comes first, with affixes, and Lynne is the Junior Handling judge (pure JH row: %s)', async (withPureJhRow) => {
    const showId = await winterSpectacular({ withPureJhRow });
    const snapshot = await buildCatalogueSnapshot(db, showId);
    const list = snapshot.showInfoBase.judgeDisplayList ?? [];
    expect(list[0]).toMatch(/^Dogs & Bitches — Sami Baggstrom \(Sensen Mann\)/);
    expect(list.some((l) => l.startsWith('Junior Handling — Lynne Harvey (Muscava)'))).toBe(true);
    expect(list.findIndex((l) => l.includes('Lynne'))).toBeGreaterThan(0);
    // Lynne is not the breed judge anywhere in the catalogue.
    expect(Object.values(snapshot.showInfoBase.judgesByBreedName ?? {})).not.toContain('Lynne Harvey');

    const text = pdfText(await renderCatalogueFromSnapshot(snapshot, 'standard'));
    const judgesPage = text.slice(text.indexOf('our esteemed judges'));
    expect(judgesPage.indexOf('Sami Baggstrom (Sensen Mann)')).toBeGreaterThan(-1);
    expect(judgesPage.indexOf('Sami Baggstrom (Sensen Mann)')).toBeLessThan(judgesPage.indexOf('Lynne Harvey (Muscava)'));
  });

  it("prints the secretary's awards text, not four fixed lines", async () => {
    const showId = await winterSpectacular({ withPureJhRow: true });
    const text = pdfText(await renderCatalogueFromSnapshot(await buildCatalogueSnapshot(db, showId), 'standard'));
    for (const line of AWARDS.split('\n')) expect(text).toContain(line);
    expect(text).not.toContain('Medals for 2nd & 3rd place');
  });
});
