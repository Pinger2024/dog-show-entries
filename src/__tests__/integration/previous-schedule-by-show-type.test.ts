/**
 * A new show's schedule starts from the club's earlier shows: the awards
 * wording and the list of awards from the club's last show of the SAME type,
 * everything else from its latest show (Mandy, Telegram 8329 / 8334,
 * 19 Nov 2026).
 *
 * South Western ran a championship show, then created an open show, which
 * copied the championship's specials wording. They want different wording on
 * the open show and to keep the championship wording for future championship
 * shows. Before this, a new show copied every field from whichever show was
 * created most recently, so the next championship show would have started
 * with the open show's wording.
 *
 * Mandy: "the awards wording, and the list of awards given not the prize money
 * as that's defo always subject to change".
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { makeShow, makeSecretaryWithOrg } from '../helpers/factories';
import type { ScheduleData } from '@/server/db/schema/shows';

const CHAMP_WORDING = 'ROYAL CANIN offer Prizes for Best in Show. The Society offers Special Rosettes for Dog CC, Bitch CC.';
const OPEN_WORDING = 'ROYAL CANIN offer Prizes for Best in Show. Rosettes 1st - 4th in all classes.';
const CHAMP_AWARDS = ['Best in Show', 'Reserve Best in Show', 'Dog Challenge Certificate', 'Bitch Challenge Certificate'];
const OPEN_AWARDS = ['Best in Show', 'Reserve Best in Show', 'Best Puppy in Show', 'Best Veteran in Show'];

function champSchedule(): ScheduleData {
  return {
    awardsDescription: CHAMP_WORDING,
    bestAwards: CHAMP_AWARDS,
    prizeMoney: 'Champ prize money',
    officers: [{ name: 'Old Chair', position: 'Chairman' }],
    catering: 'Champ catering',
  };
}

function openSchedule(): ScheduleData {
  return {
    awardsDescription: OPEN_WORDING,
    bestAwards: OPEN_AWARDS,
    prizeMoney: 'Open prize money',
    officers: [{ name: 'New Chair', position: 'Chairman' }],
    catering: 'Open catering',
  };
}

/** A club that ran a championship show and then created an open show. */
async function southWesternLikeClub() {
  const { user, org } = await makeSecretaryWithOrg();
  await makeShow({
    organisationId: org.id,
    name: 'Championship Show 2026',
    showType: 'championship',
    showRuleset: 'rkc',
    scheduleData: champSchedule(),
    onCallVet: 'Champ vet',
    createdAt: new Date('2026-05-14T09:00:00Z'),
  });
  await makeShow({
    organisationId: org.id,
    name: 'Open Show 2027',
    showType: 'open',
    showRuleset: 'rkc',
    scheduleData: openSchedule(),
    onCallVet: 'Open vet',
    createdAt: new Date('2026-11-19T13:23:00Z'),
  });
  return { user, org };
}

describe('a new show starts from the club\'s last show of the same type for its awards', () => {
  it('a new championship show gets the championship wording and awards, not the newer open show\'s', async () => {
    const { user, org } = await southWesternLikeClub();
    const next = await makeShow({ organisationId: org.id, showType: 'championship', showRuleset: 'rkc', createdAt: new Date('2027-06-01T09:00:00Z') });

    const prev = await createTestCaller(user).secretary.getPreviousScheduleData({ showId: next.id });
    const sd = prev!.scheduleData as ScheduleData;

    expect(sd.awardsDescription).toBe(CHAMP_WORDING);
    expect(sd.bestAwards).toEqual(CHAMP_AWARDS);
    // so the note above the form can say where each part came from
    expect(prev!.latestShowName).toBe('Open Show 2027');
    expect(prev!.awardsFromShowName).toBe('Championship Show 2026');
  });

  it('everything else, prize money included, still comes from the latest show', async () => {
    const { user, org } = await southWesternLikeClub();
    const next = await makeShow({ organisationId: org.id, showType: 'championship', showRuleset: 'rkc', createdAt: new Date('2027-06-01T09:00:00Z') });

    const prev = await createTestCaller(user).secretary.getPreviousScheduleData({ showId: next.id });
    const sd = prev!.scheduleData as ScheduleData;

    expect(sd.prizeMoney).toBe('Open prize money');
    expect(sd.officers).toEqual([{ name: 'New Chair', position: 'Chairman' }]);
    expect(sd.catering).toBe('Open catering');
    expect(prev!.onCallVet).toBe('Open vet');
  });

  it('a new open show gets the open show\'s wording and awards', async () => {
    const { user, org } = await southWesternLikeClub();
    const next = await makeShow({ organisationId: org.id, showType: 'open', showRuleset: 'rkc', createdAt: new Date('2027-06-01T09:00:00Z') });

    const prev = await createTestCaller(user).secretary.getPreviousScheduleData({ showId: next.id });
    const sd = prev!.scheduleData as ScheduleData;

    expect(sd.awardsDescription).toBe(OPEN_WORDING);
    expect(sd.bestAwards).toEqual(OPEN_AWARDS);
    // the latest show IS the same-type show: nothing extra to say
    expect(prev!.awardsFromShowName).toBeNull();
  });

  it('a club\'s first show of a type starts from its latest show, as before', async () => {
    const { user, org } = await southWesternLikeClub();
    const next = await makeShow({ organisationId: org.id, showType: 'limited', showRuleset: 'rkc', createdAt: new Date('2027-06-01T09:00:00Z') });

    const prev = await createTestCaller(user).secretary.getPreviousScheduleData({ showId: next.id });

    expect(prev!.scheduleData).toEqual(openSchedule());
  });

  it('a regional is not the same type as an RKC championship show, though both are stored as championship', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    await makeShow({
      organisationId: org.id,
      showType: 'championship',
      showRuleset: 'rkc',
      scheduleData: champSchedule(),
      createdAt: new Date('2026-05-14T09:00:00Z'),
    });
    await makeShow({
      organisationId: org.id,
      showType: 'championship',
      showRuleset: 'wusv',
      scheduleData: { awardsDescription: 'Regional wording', bestAwards: ['Best Dog', 'Best Bitch'] },
      createdAt: new Date('2026-09-01T09:00:00Z'),
    });
    const next = await makeShow({ organisationId: org.id, showType: 'championship', showRuleset: 'rkc', createdAt: new Date('2027-06-01T09:00:00Z') });

    const prev = await createTestCaller(user).secretary.getPreviousScheduleData({ showId: next.id });
    const sd = prev!.scheduleData as ScheduleData;

    expect(sd.awardsDescription).toBe(CHAMP_WORDING);
    expect(sd.bestAwards).toEqual(CHAMP_AWARDS);
  });

  it('a same-type show with no schedule saved is passed over for the one before it', async () => {
    const { user, org } = await southWesternLikeClub();
    // A championship show created later whose schedule was never filled in.
    await makeShow({ organisationId: org.id, showType: 'championship', showRuleset: 'rkc', createdAt: new Date('2026-12-01T09:00:00Z') });
    const next = await makeShow({ organisationId: org.id, showType: 'championship', showRuleset: 'rkc', createdAt: new Date('2027-06-01T09:00:00Z') });

    const prev = await createTestCaller(user).secretary.getPreviousScheduleData({ showId: next.id });
    const sd = prev!.scheduleData as ScheduleData;

    expect(sd.awardsDescription).toBe(CHAMP_WORDING);
  });

  it('the same-type show\'s wording is used even when it left the box empty', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    await makeShow({
      organisationId: org.id,
      showType: 'championship',
      showRuleset: 'rkc',
      scheduleData: { catering: 'Champ catering' },
      createdAt: new Date('2026-05-14T09:00:00Z'),
    });
    await makeShow({
      organisationId: org.id,
      showType: 'open',
      showRuleset: 'rkc',
      scheduleData: openSchedule(),
      createdAt: new Date('2026-11-19T13:23:00Z'),
    });
    const next = await makeShow({ organisationId: org.id, showType: 'championship', showRuleset: 'rkc', createdAt: new Date('2027-06-01T09:00:00Z') });

    const prev = await createTestCaller(user).secretary.getPreviousScheduleData({ showId: next.id });
    const sd = prev!.scheduleData as ScheduleData;

    // The open show's specials never leak into a championship schedule.
    expect(sd.awardsDescription).toBeUndefined();
    expect(sd.bestAwards).toBeUndefined();
    expect(sd.catering).toBe('Open catering');
  });
});
