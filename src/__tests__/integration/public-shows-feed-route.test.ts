/**
 * GET /api/shows — the public show feed.
 *
 * WHY IT EXISTS. The GSD Breed Council website (a separate project) kept a
 * hand-written Python dict, `REMI_SHOWS` in its `build.py`, mapping its
 * calendar dates to Remi slugs and venues. That is Remi's own state written
 * down twice, in another language, in another repository — so its "Enter on
 * Remi" button went wrong the moment Winter Spectacular's entries closed
 * (1 Nov 2026) and nothing in a static build knew. This feed is the one
 * owner that replaces it.
 *
 * WHAT IS BEING PROVED, and why each case is here rather than being obvious:
 *
 *  - Draft and cancelled shows must never appear. Both GSD Club of Scotland
 *    2027 shows sit on production as `draft` right now, with their secretary
 *    contact details on them. This is the test that makes the endpoint safe
 *    to publish at all.
 *  - A show whose close date has passed reads "entries_closed" even while the
 *    once-daily cron still has it as `entries_open` — the cron-lag trap
 *    `publicShowStatus` exists for. Winter Spectacular was in exactly that
 *    state on production the morning this was written.
 *  - No club bank details, ever. `makeOrg` sets payout sort code and account
 *    number by default, and a public payload carrying them is a leak we have
 *    already had once (hence `publicOrgColumns`). The assertion scans the
 *    whole serialised body, so a column added to the allow-list later cannot
 *    sneak through unnoticed.
 *  - The closing date is published twice on purpose: the instant, and the
 *    Europe/London calendar date. A consumer that does
 *    `date.fromisoformat(...)` on a BST-midnight instant gets the PREVIOUS
 *    day, which is the UTC-date bug class from September all over again —
 *    except in someone else's repository where our tests cannot see it.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results, venues } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import {
  makeOrg,
  makeShow,
  makeUser,
  makeBreed,
  makeDog,
  makeShowClass,
  makeEntry,
  makeEntryClass,
  makeResult,
} from '../helpers/factories';
import { GET } from '@/app/api/shows/route';
import { londonDateOffset } from '@/lib/date-utils';

type FeedItem = {
  id: string;
  slug: string | null;
  name: string;
  url: string;
  showType: string;
  showTypeLabel: string;
  club: { name: string; website: string | null };
  venue: { name: string; address: string | null; postcode: string | null } | null;
  startDate: string;
  endDate: string | null;
  entryCloseDate: string | null;
  entryCloseDateLondon: string | null;
  entriesExtendedNotice: string | null;
  status: string;
  entriesOpen: boolean;
  results: 'live' | 'available' | 'none';
  resultsUrl: string | null;
};

async function feed() {
  const res = await GET();
  expect(res.status).toBe(200);
  const body = (await res.json()) as { generatedAt: string; count: number; shows: FeedItem[] };
  return body;
}

describe('GET /api/shows — the public show feed', () => {
  it('never lists a draft or cancelled show', async () => {
    const org = await makeOrg();
    const draft = await makeShow({
      organisationId: org.id,
      name: 'GSD Club of Scotland 2027',
      status: 'draft',
      startDate: londonDateOffset(200),
      endDate: londonDateOffset(200),
    });
    const cancelled = await makeShow({
      organisationId: org.id,
      status: 'cancelled',
      startDate: londonDateOffset(60),
      endDate: londonDateOffset(60),
    });
    const open = await makeShow({
      organisationId: org.id,
      status: 'entries_open',
      startDate: londonDateOffset(60),
      endDate: londonDateOffset(60),
    });

    const body = await feed();
    const ids = body.shows.map((s) => s.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(cancelled.id);
  });

  it('reads entries_closed the instant the close date passes, before the cron catches up', async () => {
    const org = await makeOrg();
    // Winter Spectacular's state on 1 Nov 2026: closed by date, still
    // `entries_open` in the database because the daily cron runs once.
    const show = await makeShow({
      organisationId: org.id,
      name: 'Winter Spectacular',
      status: 'entries_open',
      startDate: londonDateOffset(14),
      endDate: londonDateOffset(14),
      entryCloseDate: new Date(Date.now() - 60 * 60 * 1000),
    });

    const body = await feed();
    const item = body.shows.find((s) => s.id === show.id);
    expect(item?.status).toBe('entries_closed');
    expect(item?.entriesOpen).toBe(false);
  });

  it('lists a show that has not opened yet, and says you cannot enter it', async () => {
    const org = await makeOrg();
    const show = await makeShow({
      organisationId: org.id,
      status: 'published',
      startDate: londonDateOffset(120),
      endDate: londonDateOffset(120),
    });

    const body = await feed();
    const item = body.shows.find((s) => s.id === show.id);
    expect(item?.status).toBe('published');
    expect(item?.entriesOpen).toBe(false);
  });

  it('publishes the closing date as an instant AND a Europe/London calendar date', async () => {
    const org = await makeOrg();
    // 2030-08-10T23:00:00Z is 11 August 2030, 00:00, British Summer Time.
    // A consumer reading only the instant's UTC date would say the 10th and
    // close its "Enter" button a day early.
    const show = await makeShow({
      organisationId: org.id,
      status: 'entries_open',
      startDate: '2030-08-25',
      endDate: '2030-08-25',
      entryCloseDate: new Date('2030-08-10T23:00:00Z'),
    });

    const body = await feed();
    const item = body.shows.find((s) => s.id === show.id);
    expect(item?.entryCloseDate).toBe('2030-08-10T23:00:00.000Z');
    expect(item?.entryCloseDateLondon).toBe('2030-08-11');
    expect(item?.entriesOpen).toBe(true);
  });

  it('carries the club, the venue and a usable show link — and no bank details', async () => {
    const org = await makeOrg({ name: 'GSD Club of Scotland', website: 'https://example.invalid' });
    const [venue] = await testDb
      .insert(venues)
      .values({
        name: 'Sidewood Canine Services',
        address: 'Blackhill Road, Forth, Lanark',
        postcode: 'ML11 8ET',
      })
      .returning();
    const show = await makeShow({
      organisationId: org.id,
      venueId: venue!.id,
      slug: 'gsd-club-of-scotland-2027',
      status: 'entries_open',
      showType: 'championship',
      startDate: londonDateOffset(90),
      endDate: londonDateOffset(90),
    });

    const body = await feed();
    const item = body.shows.find((s) => s.id === show.id);
    expect(item?.club.name).toBe('GSD Club of Scotland');
    expect(item?.venue?.name).toBe('Sidewood Canine Services');
    expect(item?.venue?.postcode).toBe('ML11 8ET');
    // The LIVE origin, not this deployment's: an outside site builds real
    // exhibitor links from these, so a feed read from demo must never send
    // anyone to demo. (In this test NEXTAUTH_URL is localhost, so a
    // deployment-relative link would read http://localhost:3000.)
    expect(item?.url).toBe('https://remishowmanager.co.uk/shows/gsd-club-of-scotland-2027');
    expect(item?.showTypeLabel).toBe('Championship Show');

    // The leak we have already had: payout details must not be anywhere in
    // the body, under any key.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('10-88-00');
    expect(serialised).not.toContain('00012345');
    expect(serialised.toLowerCase()).not.toContain('payout');
  });

  it('points at the results page only once a show has published results', async () => {
    const org = await makeOrg();
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'feed-results@test.local' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const held = await makeShow({
      organisationId: org.id,
      slug: 'north-eastern-2026',
      status: 'completed',
      startDate: londonDateOffset(-30),
      endDate: londonDateOffset(-30),
    });
    const quiet = await makeShow({
      organisationId: org.id,
      status: 'completed',
      startDate: londonDateOffset(-31),
      endDate: londonDateOffset(-31),
    });

    const showClass = await makeShowClass({ showId: held.id, breedId: breed.id });
    const entry = await makeEntry({ showId: held.id, dogId: dog.id, exhibitorId: exhibitor.id });
    const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: showClass!.id });
    const result = await makeResult({ entryClassId: entryClass!.id, placement: 1 });
    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result!.id));

    const body = await feed();
    const withResults = body.shows.find((s) => s.id === held.id);
    const without = body.shows.find((s) => s.id === quiet.id);

    expect(withResults?.results).toBe('available');
    expect(withResults?.resultsUrl).toContain('/shows/north-eastern-2026/results');
    expect(without?.results).toBe('none');
    expect(without?.resultsUrl).toBeNull();
  });
});
