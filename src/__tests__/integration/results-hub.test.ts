import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results } from '@/server/db/schema';
import { londonDateOffset, todayInLondon } from '@/lib/date-utils';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeShow,
  makeBreed,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeShowClass,
  makeResult,
} from '../helpers/factories';

/**
 * The public Results page (Mandy, 5 Oct 2026): "finding the live results is
 * still quite tricky because people won't go into 'in progress' to view because
 * they don't know how to". One list — shows running today, then shows with
 * results to look back at — that anyone can open without choosing a filter.
 */

const anon = () => createTestCaller(null);

async function showWith(opts: {
  club: string;
  status: 'draft' | 'published' | 'entries_open' | 'entries_closed' | 'in_progress' | 'completed' | 'cancelled';
  daysFromToday: number;
  result?: 'published' | 'unpublished';
}) {
  const org = await makeOrg({ name: opts.club });
  const date = londonDateOffset(opts.daysFromToday);
  const show = await makeShow({
    organisationId: org.id,
    name: `${opts.club} Show`,
    status: opts.status,
    startDate: date,
    endDate: date,
  });
  if (opts.result) {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const result = await makeResult({ entryClassId: ec.id, placement: 1 });
    if (opts.result === 'published') {
      await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));
    }
  }
  return show;
}

describe('Results page — live shows first, without choosing a filter', () => {
  it('a show running today is live, signed in or not', async () => {
    const running = await showWith({ club: 'Midlands Region', status: 'in_progress', daysFromToday: 0 });
    const list = await anon().shows.results();
    expect(list.live.map((s) => s.id)).toEqual([running.id]);
    expect(list.live[0]).toMatchObject({ clubName: 'Midlands Region', startDate: todayInLondon() });
  });

  it('a show on its own day is live even before the morning cron has moved it on', async () => {
    const today = await showWith({ club: 'North Eastern', status: 'entries_closed', daysFromToday: 0 });
    const list = await anon().shows.results();
    expect(list.live.map((s) => s.id)).toEqual([today.id]);
  });
});

describe('Results page — shows held, with results to read', () => {
  it('lists held shows with published results, newest first', async () => {
    const older = await showWith({ club: 'South Western', status: 'completed', daysFromToday: -40, result: 'published' });
    const newer = await showWith({ club: 'Clyde Valley', status: 'completed', daysFromToday: -10, result: 'published' });
    const list = await anon().shows.results();
    expect(list.recent.map((s) => s.id)).toEqual([newer.id, older.id]);
    expect(list.live).toEqual([]);
  });

  it('never lists a held show whose results are not published — no empty pages', async () => {
    await showWith({ club: 'Waiting Club', status: 'completed', daysFromToday: -3, result: 'unpublished' });
    await showWith({ club: 'Nothing Recorded', status: 'completed', daysFromToday: -3 });
    const list = await anon().shows.results();
    expect(list.recent).toEqual([]);
  });

  it('never lists a draft or cancelled show, whatever it holds', async () => {
    await showWith({ club: 'Draft Club', status: 'draft', daysFromToday: 0, result: 'published' });
    await showWith({ club: 'Cancelled Club', status: 'cancelled', daysFromToday: -5, result: 'published' });
    const list = await anon().shows.results();
    expect(list.live).toEqual([]);
    expect(list.recent).toEqual([]);
  });
});

describe('Results page — a quiet day says when the next show is', () => {
  it('names the nearest upcoming show', async () => {
    await showWith({ club: 'Later Club', status: 'entries_open', daysFromToday: 30 });
    const soon = await showWith({ club: 'North Eastern', status: 'entries_closed', daysFromToday: 6 });
    await showWith({ club: 'Draft Club', status: 'draft', daysFromToday: 2 });
    const list = await anon().shows.results();
    expect(list.next?.id).toBe(soon.id);
  });
});

describe('Results page — only public details leave the server', () => {
  it("never carries a club's bank details or contact details", async () => {
    await showWith({ club: 'Private Club', status: 'completed', daysFromToday: -2, result: 'published' });
    await showWith({ club: 'Running Club', status: 'in_progress', daysFromToday: 0 });
    const list = await anon().shows.results();
    const payload = JSON.stringify(list);
    expect(payload).not.toMatch(/10-88-00|00012345|payout|sortCode|accountNumber|contactEmail|contactPhone/);
    for (const s of [...list.live, ...list.recent]) {
      expect(Object.keys(s).sort()).toEqual(['clubName', 'endDate', 'id', 'name', 'slug', 'startDate', 'venueName']);
    }
  });
});

describe("The show page's results link reads the same rule", () => {
  it('reports published results for a held show, and none for one without', async () => {
    const withResults = await showWith({ club: 'Scotland', status: 'completed', daysFromToday: -30, result: 'published' });
    const without = await showWith({ club: 'Waiting Club', status: 'completed', daysFromToday: -3, result: 'unpublished' });
    expect((await anon().shows.getById({ id: withResults.id })).hasPublishedResults).toBe(true);
    expect((await anon().shows.getById({ id: without.id })).hasPublishedResults).toBe(false);
  });
});
