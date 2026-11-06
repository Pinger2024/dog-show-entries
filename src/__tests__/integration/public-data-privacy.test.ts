import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { achievements, dogOwners, judgeAssignments, results } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { getPublicDogSummary, listDogsWithPublicHistory } from '@/server/services/public-dog-summary';
import { todayInLondon } from '@/lib/date-utils';
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
  makeJudge,
  makeJudgeAssignment,
  makeSecretaryWithOrg,
  dateStr,
} from '../helpers/factories';

/**
 * Regression tests for the 2026-06-12 public-data privacy hotfix.
 *
 * Three leaks, one theme — data crossing from club/secretary scope into
 * public payloads:
 *  1. Club payout bank details (sort code / account number) embedded in
 *     every public show response via the full organisations row.
 *  2. Draft shows (incl. secretary PII) enumerable through the public
 *     shows.list status filter.
 *  3. The public dog profile revealing upcoming-show entries (pre-judging
 *     risk) and keyed-in-but-unpublished results/achievements.
 */

const anon = () => createTestCaller(null);
const futureDate = (daysAhead: number) => dateStr(daysAhead);
const pastDate = (daysAgo: number) => dateStr(-daysAgo);

describe('public payloads never include club bank details', () => {
  it('shows.getById returns the organisation without payout or Stripe fields', async () => {
    // makeOrg defaults to payment-ready: payout details are set.
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });

    const result = await anon().shows.getById({ id: show.id });
    const orgPayload = result.organisation as Record<string, unknown>;

    expect(orgPayload.name).toBe(org.name);
    expect(orgPayload).not.toHaveProperty('payoutSortCode');
    expect(orgPayload).not.toHaveProperty('payoutAccountNumber');
    expect(orgPayload).not.toHaveProperty('payoutAccountName');
    expect(orgPayload).not.toHaveProperty('stripeCustomerId');
    expect(orgPayload).not.toHaveProperty('stripeSubscriptionId');
    expect(orgPayload).not.toHaveProperty('stripeAccountId');
  });

  it('shows.list returns organisations without payout or Stripe fields', async () => {
    const org = await makeOrg();
    await makeShow({ organisationId: org.id, status: 'entries_open' });

    const { items } = await anon().shows.list({ limit: 20, cursor: 0 });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const orgPayload = item.organisation as Record<string, unknown>;
      expect(orgPayload).not.toHaveProperty('payoutSortCode');
      expect(orgPayload).not.toHaveProperty('payoutAccountNumber');
      expect(orgPayload).not.toHaveProperty('stripeCustomerId');
    }
  });

  it('steward.getLiveResults returns the organisation without payout fields', async () => {
    const org = await makeOrg();
    const show = await makeShow({
      organisationId: org.id,
      status: 'in_progress',
      startDate: pastDate(0),
      endDate: pastDate(0),
    });

    const live = await anon().steward.getLiveResults({ showId: show.id });
    const orgPayload = live.show.organisation as Record<string, unknown>;
    expect(orgPayload.name).toBe(org.name);
    expect(orgPayload).not.toHaveProperty('payoutSortCode');
    expect(orgPayload).not.toHaveProperty('payoutAccountNumber');
  });
});

describe('draft shows are not publicly enumerable', () => {
  it('shows.list rejects a draft status filter outright', async () => {
    await expect(
      // The enum no longer admits 'draft' — cast simulates a crafted request.
      anon().shows.list({ status: 'draft' as never, limit: 20, cursor: 0 })
    ).rejects.toThrow();
  });

  it('default shows.list never includes draft or cancelled shows', async () => {
    const org = await makeOrg();
    const draft = await makeShow({ organisationId: org.id, status: 'draft' });
    const cancelled = await makeShow({ organisationId: org.id, status: 'cancelled' });
    await makeShow({ organisationId: org.id, status: 'entries_open' });

    const { items } = await anon().shows.list({ limit: 100, cursor: 0 });
    const ids = items.map((s) => s.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(cancelled.id);
  });
});

describe('public dog profile pre-judging and publication gates', () => {
  it('hides upcoming-show entries from the public but not from the owner', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const upcomingShow = await makeShow({
      organisationId: org.id,
      status: 'entries_open',
      startDate: futureDate(14),
      endDate: futureDate(14),
    });
    await makeEntry({
      showId: upcomingShow.id,
      dogId: dog.id,
      exhibitorId: owner.id,
      status: 'confirmed',
    });

    // A judge (or anyone) must not see the dog is entered in a future show.
    const publicView = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(publicView.showHistory).toHaveLength(0);
    expect(publicView.stats.totalShows).toBe(0);

    // The owner still sees their own upcoming entry.
    const ownerView = await createTestCaller(owner).dogs.getPublicProfile({ id: dog.id });
    expect(ownerView.showHistory).toHaveLength(1);
  });

  it('hides unpublished results from the public until publication', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const pastShow = await makeShow({
      organisationId: org.id,
      status: 'completed',
      startDate: pastDate(7),
      endDate: pastDate(7),
    });
    const showClass = await makeShowClass({ showId: pastShow.id, breedId: breed.id });
    const entry = await makeEntry({
      showId: pastShow.id,
      dogId: dog.id,
      exhibitorId: owner.id,
      status: 'confirmed',
    });
    const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const result = await makeResult({ entryClassId: entryClass.id, placement: 1 });

    // Keyed in but not yet published: nothing about the class shows. (Until
    // 1 Oct 2026 the show appeared with the class "unplaced" — a winner
    // looked like a loser until the secretary pressed publish. Mandy's rule:
    // a show appears once the dog has been judged there and it's published.)
    let publicView = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(publicView.showHistory).toHaveLength(0);
    expect(publicView.stats.firsts).toBe(0);

    // Publish, and the placement becomes visible.
    await testDb
      .update(results)
      .set({ publishedAt: new Date() })
      .where(eq(results.id, result.id));

    publicView = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(publicView.showHistory[0]!.classes[0]!.placement).toBe(1);
    expect(publicView.stats.firsts).toBe(1);
  });

  it('timeline.getForDog only surfaces published results', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const pastShow = await makeShow({
      organisationId: org.id,
      status: 'completed',
      startDate: pastDate(7),
      endDate: pastDate(7),
    });
    const showClass = await makeShowClass({ showId: pastShow.id, breedId: breed.id });
    const entry = await makeEntry({
      showId: pastShow.id,
      dogId: dog.id,
      exhibitorId: owner.id,
      status: 'confirmed',
    });
    const entryClass = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const result = await makeResult({ entryClassId: entryClass.id, placement: 2 });

    let timeline = await anon().timeline.getForDog({ dogId: dog.id, limit: 20 });
    expect(timeline.items.filter((i) => i.itemType === 'show_result')).toHaveLength(0);

    await testDb
      .update(results)
      .set({ publishedAt: new Date() })
      .where(eq(results.id, result.id));

    timeline = await anon().timeline.getForDog({ dogId: dog.id, limit: 20 });
    expect(timeline.items.filter((i) => i.itemType === 'show_result')).toHaveLength(1);
  });
});

/**
 * Mandy, 1 Oct 2026: "we should never show a dog and what its upcoming shows
 * are, only shows that are in the past, have been judged". Rosebud Edie of
 * Hundark's page showed her four past shows, but her link preview said
 * "6 shows entered" and her share image "6 Shows" — her Midlands and North
 * Eastern entries were in the count. Every public view of a dog now goes
 * through lib/public-dog-history.ts.
 */
describe("a dog's upcoming entries and unpublished placings stay private everywhere", () => {
  /** A dog judged at one past show (published 1st) and entered at two upcoming ones. */
  async function rosebudShape() {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();

    const past = await makeShow({ organisationId: org.id, status: 'completed', startDate: pastDate(50), endDate: pastDate(50) });
    const pastClass = await makeShowClass({ showId: past.id, breedId: breed.id });
    const pastEntry = await makeEntry({ showId: past.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const pastEc = await makeEntryClass({ entryId: pastEntry.id, showClassId: pastClass.id });
    const pastResult = await makeResult({ entryClassId: pastEc.id, placement: 1, specialAward: 'CC' });
    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, pastResult.id));

    for (const daysAhead of [3, 10]) {
      const upcoming = await makeShow({
        organisationId: org.id,
        status: 'entries_closed',
        startDate: futureDate(daysAhead),
        endDate: futureDate(daysAhead),
      });
      const upcomingClass = await makeShowClass({ showId: upcoming.id, breedId: breed.id });
      const upcomingEntry = await makeEntry({ showId: upcoming.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
      await makeEntryClass({ entryId: upcomingEntry.id, showClassId: upcomingClass.id });
    }
    return { owner, breed, dog, org };
  }

  it('the link preview and share image count only the show she has been judged at', async () => {
    const { dog } = await rosebudShape();
    expect(await getPublicDogSummary(testDb, dog.id)).toEqual({ shows: 1, firsts: 1, specialAwards: 1, critiques: 0 });
  });

  it('the sitemap leaves out a dog whose only entries are upcoming', async () => {
    const { dog } = await rosebudShape();
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const newcomer = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const upcoming = await makeShow({ organisationId: org.id, status: 'entries_closed', startDate: futureDate(3), endDate: futureDate(3) });
    await makeEntry({ showId: upcoming.id, dogId: newcomer.id, exhibitorId: owner.id, status: 'confirmed' });

    const ids = (await listDogsWithPublicHistory(testDb)).map((d) => d.id);
    expect(ids).toContain(dog.id);
    expect(ids).not.toContain(newcomer.id);
  });

  it("on the day of the show, the dog's page says nothing until its result is published", async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const today = todayInLondon();
    const show = await makeShow({ organisationId: org.id, status: 'in_progress', startDate: today, endDate: today });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });

    // Before judging: a judge looking the dog up must not see it is entered today.
    expect((await anon().dogs.getPublicProfile({ id: dog.id })).showHistory).toHaveLength(0);

    // Judged, keyed in, not yet published: still nothing.
    const result = await makeResult({ entryClassId: ec.id, placement: 2 });
    expect((await anon().dogs.getPublicProfile({ id: dog.id })).showHistory).toHaveLength(0);

    // Published: the show and its placing appear.
    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));
    const view = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(view.showHistory).toHaveLength(1);
    expect(view.showHistory[0]!.classes[0]!.placement).toBe(2);
  });

  it("a class the dog was absent from says Absent on its page, not Unplaced (Drama von Arlett)", async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, status: 'completed', startDate: pastDate(27), endDate: pastDate(27) });
    const adult = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entry.id, showClassId: adult.id, absent: true });

    const view = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(view.showHistory).toHaveLength(1);
    expect(view.showHistory[0]!.classes[0]!.outcome).toBe('absent');
    // Listed, but she wasn't shown there — so it isn't one of her shows.
    expect(view.stats.totalShows).toBe(0);
    expect(view.stats.totalClasses).toBe(0);
    expect((await getPublicDogSummary(testDb, dog.id)).shows).toBe(0);
  });

  it('a withheld placing says Withheld on the dog\'s page', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, status: 'completed', startDate: pastDate(10), endDate: pastDate(10) });
    const cls = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: cls.id });
    const result = await makeResult({ entryClassId: ec.id, placement: null, placementStatus: 'withheld' });
    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));

    const view = await anon().dogs.getPublicProfile({ id: dog.id });
    expect(view.showHistory[0]!.classes[0]!.outcome).toBe('withheld');
  });

  it('the championship widget counts no upcoming show and no unpublished CC', async () => {
    const { owner, breed, dog, org } = await rosebudShape();
    // CCs are awards (the achievements table — recorded on show day, or added
    // by the owner): one published 50 days ago, one judged a week ago and
    // not yet published.
    await testDb.insert(achievements).values({ dogId: dog.id, type: 'cc', date: pastDate(50), publishedAt: new Date() });
    const recent = await makeShow({ organisationId: org.id, status: 'completed', startDate: pastDate(7), endDate: pastDate(7) });
    const recentClass = await makeShowClass({ showId: recent.id, breedId: breed.id });
    const recentEntry = await makeEntry({ showId: recent.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const recentEc = await makeEntryClass({ entryId: recentEntry.id, showClassId: recentClass.id });
    await makeResult({ entryClassId: recentEc.id, placement: 1 });
    await testDb.insert(achievements).values({ dogId: dog.id, showId: recent.id, type: 'cc', date: pastDate(7) });

    const publicView = await anon().pro.getChampionshipProgress({ dogId: dog.id });
    expect(publicView.championship.classic.ccs).toBe(1);
    const publicShows = publicView.analytics.yearlyBreakdown.reduce((n, y) => n + y.shows, 0);
    expect(publicShows).toBe(1);

    const ownerView = await createTestCaller(owner).pro.getChampionshipProgress({ dogId: dog.id });
    expect(ownerView.championship.classic.ccs).toBe(2);
  });

  it("a follower's feed never shows a placing before it is published", async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const follower = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, status: 'completed', startDate: pastDate(2), endDate: pastDate(2) });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const result = await makeResult({ entryClassId: ec.id, placement: 1 });
    await createTestCaller(follower).follows.toggle({ dogId: dog.id });

    const showResults = async () =>
      (await createTestCaller(follower).timeline.getFeed({ limit: 20 })).items.filter((i) => i.itemType === 'show_result');
    expect(await showResults()).toHaveLength(0);

    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));
    expect(await showResults()).toHaveLength(1);
  });

  it("another exhibitor asking for a dog's wins gets only published ones; the owner gets all", async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const rival = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, status: 'completed', showType: 'open', startDate: pastDate(2), endDate: pastDate(2) });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    await makeResult({ entryClassId: ec.id, placement: 1 });

    const rivalSummary = await createTestCaller(rival).dogs.getWinSummary({ dogId: dog.id });
    const ownerSummary = await createTestCaller(owner).dogs.getWinSummary({ dogId: dog.id });
    expect(rivalSummary.totalFirsts).toBe(0);
    expect(ownerSummary.totalFirsts).toBe(1);
  });
});

/**
 * Bug hunt 2026-09-22: shows.getById is public and joined judge_assignments
 * and judges with no column scoping, so every visitor received the judge's
 * results-approval token (the only credential /api/results-approval/<token>
 * checks — enough to read unpublished placings and approve them as the
 * judge) and the judge's personal email and phone.
 */
describe('public show payloads never include judge approval tokens or judge contact details', () => {
  async function showWithPendingApproval() {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'in_progress' });
    const judge = await makeJudge({ contactEmail: 'judge.private@example.com', contactPhone: '07700 900123' });
    const ja = await makeJudgeAssignment({ showId: show.id, judgeId: judge.id });
    const token = '11111111-2222-4333-8444-555555555555';
    await testDb
      .update(judgeAssignments)
      .set({ approvalToken: token, approvalStatus: 'pending', approvalSentAt: new Date(), approvalNote: 'private note' })
      .where(eq(judgeAssignments.id, ja.id));
    return { secretary, show, judge, token };
  }

  it('anonymous visitors get the judge name but no token, approval state or contact details', async () => {
    const { show, judge, token } = await showWithPendingApproval();
    const result = await anon().shows.getById({ id: show.id });

    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain('judge.private@example.com');
    expect(JSON.stringify(result)).not.toContain('07700 900123');
    const ja = result.judgeAssignments[0] as Record<string, unknown>;
    expect((ja.judge as Record<string, unknown>).name).toBe(judge.name);
    expect(ja.approvalToken ?? null).toBeNull();
    expect(ja.approvalStatus ?? null).toBeNull();
    expect(ja.approvalNote ?? null).toBeNull();
  });

  it('a logged-in exhibitor outside the club gets the same public view', async () => {
    const { show, token } = await showWithPendingApproval();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const result = await createTestCaller(exhibitor).shows.getById({ id: show.id });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain('judge.private@example.com');
  });

  it("the club's own secretary still sees judge contact details (judge section needs them)", async () => {
    const { secretary, show } = await showWithPendingApproval();
    const result = await createTestCaller(secretary).shows.getById({ id: show.id });
    expect(result.judgeAssignments[0].judge.contactEmail).toBe('judge.private@example.com');
  });
});

/**
 * Bug hunt 2026-09-22: guarantors' HOME ADDRESSES (entered for the RKC
 * licence, never printed on the schedule or catalogue) rode along in every
 * public show payload inside scheduleData — shows.list, shows.getById — and in
 * exhibitor payloads that embed the whole show row.
 */
describe('guarantor home addresses never leave club scope', () => {
  const ADDRESS = '12 Private Lane, Hometown HT1 2AB';
  async function showWithGuarantors() {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      status: 'entries_open',
      scheduleData: { guarantors: [{ name: 'Jane Guarantor', address: ADDRESS }], catering: 'Tea and cake' },
    });
    return { secretary, org, show };
  }

  it('shows.getById (anonymous) keeps the schedule details but drops guarantor addresses', async () => {
    const { show } = await showWithGuarantors();
    const result = await anon().shows.getById({ id: show.id });
    expect(JSON.stringify(result)).not.toContain(ADDRESS);
    expect(result.scheduleData?.catering).toBe('Tea and cake');
  });

  it('shows.list never carries guarantor addresses', async () => {
    await showWithGuarantors();
    const { items } = await anon().shows.list({ limit: 50, cursor: 0 });
    expect(JSON.stringify(items)).not.toContain(ADDRESS);
  });

  it("an exhibitor's own entries and orders don't carry them either", async () => {
    const { show } = await showWithGuarantors();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    const caller = createTestCaller(exhibitor);
    expect(JSON.stringify(await caller.entries.list({}))).not.toContain(ADDRESS);
    expect(JSON.stringify(await caller.dashboard.getSummary())).not.toContain(ADDRESS);
  });

  it("the club's own secretary still gets the addresses (schedule settings form needs them)", async () => {
    const { secretary, show } = await showWithGuarantors();
    const result = await createTestCaller(secretary).shows.getById({ id: show.id });
    expect(result.scheduleData?.guarantors?.[0]?.address).toBe(ADDRESS);
  });
});

/**
 * Bug hunt 2026-09-22: secretary.searchDogs searches every dog on Remi (any
 * self-registered secretary can call it) and returned each dog's owner row in
 * full — home address and phone included. The Add Entry dialog only uses the
 * owner's name and email.
 */
describe("secretary dog search doesn't hand out owners' addresses or phones", () => {
  it('returns owner name and email only', async () => {
    const { user: secretary } = await makeSecretaryWithOrg();
    const stranger = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: stranger.id, registeredName: 'Zyxwvut Searchable Rex' });
    await testDb.insert(dogOwners).values({
      dogId: dog.id, ownerName: 'Olive Owner', ownerEmail: 'olive@example.com',
      ownerAddress: '7 Secret Street, Nowhere NW1 1AA', ownerPhone: '07700 900777',
      isPrimary: true, sortOrder: 0,
    });
    const found = await createTestCaller(secretary).secretary.searchDogs({ query: 'Zyxwvut Searchable' });
    expect(found).toHaveLength(1);
    const json = JSON.stringify(found);
    expect(json).not.toContain('7 Secret Street');
    expect(json).not.toContain('07700 900777');
    expect(found[0].owners[0]).toMatchObject({ ownerName: 'Olive Owner', ownerEmail: 'olive@example.com' });
  });
});

/**
 * Bug hunt 2026-09-22: dogs.getShowResults (any logged-in user, any dog id —
 * dog ids are public on /dog/<id>) returned every placing, special award and
 * critique for the dog with no publication gate, so a rival could read show-
 * day results before the secretary published them.
 */
describe('dogs.getShowResults respects publication', () => {
  it("hides a rival dog's unpublished placings; the owner still sees them", async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const rival = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, status: 'in_progress', startDate: pastDate(0), endDate: pastDate(0) });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const result = await makeResult({ entryClassId: ec.id, placement: 1 });

    expect(await createTestCaller(rival).dogs.getShowResults({ dogId: dog.id })).toHaveLength(0);
    expect(await createTestCaller(owner).dogs.getShowResults({ dogId: dog.id })).toHaveLength(1);

    await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));
    expect(await createTestCaller(rival).dogs.getShowResults({ dogId: dog.id })).toHaveLength(1);
  });
});
