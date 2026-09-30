/**
 * Mandy, 30 Sept 2026: "withdrawals should only be made up to closing not
 * afterwards" and "any withdrawals prior to or on entries closing should
 * reassign numbers so they run in order".
 *
 * Found checking North Eastern and Midland — both closed, both printed: the
 * exhibitor's Withdraw button was offered at any time, and a withdrawal after
 * close took the dog out of the printed catalogue's lists, the absentee list
 * and SH01 instead of it being marked absent on the day. And a withdrawal
 * while entries were open left a hole in the catalogue numbers (Midland's
 * gaps at 48 and 68 were exhibitors withdrawing).
 *
 * The window is `entryWindowOpen` — the same rule that decides whether a show
 * still accepts entries — so "open for entries" and "open for withdrawals"
 * can never disagree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeOrg, makeBreed, makeShow, makeShowClass, makeDog, makeEntry, makeEntryClass } from '../helpers/factories';
import { syncCatalogueNumbers, renumberAfterRemoval } from '@/server/services/catalogue-numbering';

async function showWithEntries(show: { status: 'entries_open' | 'entries_closed'; entryCloseDate?: Date }, count = 3) {
  const [org, breed] = await Promise.all([makeOrg(), makeBreed()]);
  const s = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: show.status,
    entryCloseDate: show.entryCloseDate ?? new Date('2030-05-01T22:59:00Z'),
  });
  const showClass = await makeShowClass({ showId: s.id, breedId: breed.id });
  const made: { exhibitor: Awaited<ReturnType<typeof makeUser>>; entryId: string }[] = [];
  for (let i = 0; i < count; i++) {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: `Dog ${String.fromCharCode(65 + i)}` });
    const entry = await makeEntry({ showId: s.id, dogId: dog.id, exhibitorId: exhibitor.id });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    made.push({ exhibitor, entryId: entry.id });
  }
  await syncCatalogueNumbers(testDb, s.id);
  return { show: s, made };
}

const numberOf = async (entryId: string) =>
  (await testDb.query.entries.findFirst({ where: eq(entries.id, entryId) }))!.catalogueNumber;

describe('exhibitor withdrawals stop when entries close', () => {
  it('refuses a withdrawal once the show has closed for entries', async () => {
    const { made } = await showWithEntries({ status: 'entries_closed', entryCloseDate: new Date('2020-01-01T23:59:00Z') });
    const { exhibitor, entryId } = made[1]!;
    await expect(createTestCaller(exhibitor).entries.withdraw({ id: entryId })).rejects.toThrow(/entries have closed/i);
    const entry = await testDb.query.entries.findFirst({ where: eq(entries.id, entryId) });
    expect(entry!.status).toBe('confirmed');
  });

  it('refuses a withdrawal after the closing date even before the daily status update has caught up', async () => {
    const { made } = await showWithEntries({ status: 'entries_open', entryCloseDate: new Date('2020-01-01T23:59:00Z') });
    const { exhibitor, entryId } = made[0]!;
    await expect(createTestCaller(exhibitor).entries.withdraw({ id: entryId })).rejects.toThrow(/entries have closed/i);
  });

  it('a withdrawal while entries are open re-numbers the catalogue so it runs in order', async () => {
    const { made } = await showWithEntries({ status: 'entries_open' });
    const before = await Promise.all(made.map((m) => numberOf(m.entryId)));
    expect(before).toEqual(['1', '2', '3']);

    await createTestCaller(made[1]!.exhibitor).entries.withdraw({ id: made[1]!.entryId });

    expect(await numberOf(made[0]!.entryId)).toBe('1');
    expect(await numberOf(made[2]!.entryId)).toBe('2');
  });

  it("the entry page only offers Withdraw while the entry window is open", () => {
    const page = readFileSync(join(process.cwd(), 'src', 'app', '(dashboard)', 'entries', '[id]', 'page.tsx'), 'utf8');
    const dialogAt = page.indexOf('<Dialog open={withdrawOpen}');
    expect(dialogAt).toBeGreaterThan(-1);
    // The condition guarding the Withdraw dialog is on the line that opens it.
    const guardLine = page.slice(page.lastIndexOf('\n', page.lastIndexOf('{', dialogAt)), dialogAt);
    expect(guardLine).toMatch(/canWithdrawEntry\(/);
  });

  it('any removal while entries are open closes the gap; once closed, nothing moves', async () => {
    // Mandy: "any withdrawals prior to or on entries closing should reassign
    // numbers so they run in order". The secretary's refund-and-cancel paths
    // remove entries too, so they share one function with entries.withdraw.
    const open = await showWithEntries({ status: 'entries_open' });
    await testDb.update(entries).set({ status: 'cancelled' }).where(eq(entries.id, open.made[0]!.entryId));
    await renumberAfterRemoval(testDb, open.show.id);
    expect(await numberOf(open.made[1]!.entryId)).toBe('1');
    expect(await numberOf(open.made[2]!.entryId)).toBe('2');

    const closed = await showWithEntries({ status: 'entries_closed', entryCloseDate: new Date('2020-01-01T23:59:00Z') });
    await testDb.update(entries).set({ status: 'cancelled' }).where(eq(entries.id, closed.made[0]!.entryId));
    await renumberAfterRemoval(testDb, closed.show.id);
    expect(await numberOf(closed.made[1]!.entryId)).toBe('2');
    expect(await numberOf(closed.made[2]!.entryId)).toBe('3');
  });

  it('every path that takes an entry out of the catalogue calls renumberAfterRemoval', () => {
    const src = (f: string) => readFileSync(join(process.cwd(), 'src', 'server', 'trpc', 'routers', f), 'utf8');
    const between = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from) + from.length));
    expect(between(src('entries.ts'), '  withdraw: protectedProcedure', '\n  update: ')).toMatch(/renumberAfterRemoval\(/);
    expect(between(src('secretary.ts'), '  refundOrder:', '  issueRefund:')).toMatch(/renumberAfterRemoval\(/);
    expect(between(src('secretary.ts'), '  issueRefund:', "\n  // ")).toMatch(/renumberAfterRemoval\(/);
  });
});
