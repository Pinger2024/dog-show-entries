/**
 * Remi sends judges the critique link by itself, two weeks after the show,
 * and one reminder four weeks after that if nothing has come back (Mandy,
 * 30 Sept 2026: "maybe 2 weeks after judging to give them time to write
 * them" · "Yes send a reminder 4 weeks later"; 7 Oct 2026: Special Awards
 * judges get it too — only Junior Handling judges don't). Until
 * then only the secretary's Invite button sent it — and on live it had been
 * pressed once, for one show out of five.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testDb } from '../helpers/db';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
  makeBreed,
} from '../helpers/factories';
import * as schema from '@/server/db/schema';
import {
  sendCritiqueInviteEmail,
  sendCritiqueReminderEmail,
  sendCritiqueAutoInviteNoticeEmail,
} from '@/server/services/email';
import { runCritiqueAutoInvites, runCritiqueReminders } from '@/server/services/critique-invites';
import { createTestCaller } from '../helpers/context';
import { addCalendarDays, critiqueReminderDate } from '@/lib/critique-schedule';
import { londonCalendarDateStr, todayInLondon } from '@/lib/date-utils';

const TODAY = '2026-10-25';

beforeEach(() => {
  vi.mocked(sendCritiqueInviteEmail).mockClear();
  vi.mocked(sendCritiqueReminderEmail).mockClear();
  vi.mocked(sendCritiqueAutoInviteNoticeEmail).mockClear();
});

/** An RKC single-breed show that ended on `endDate`, with a breed judge (dogs
 *  and bitches), a Junior Handling judge and a Special Awards judge. */
async function show(opts: { endDate?: string; showRuleset?: 'rkc' | 'wusv'; status?: 'completed' | 'cancelled' | 'draft' | 'published'; breedJudgeEmail?: string | null } = {}) {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const endDate = opts.endDate ?? '2026-10-11';
  const s = await makeShow({
    organisationId: org.id,
    name: 'North Eastern Championship Show',
    showType: 'championship',
    showScope: 'single_breed',
    showRuleset: opts.showRuleset ?? 'rkc',
    breedId: breed.id,
    startDate: endDate,
    endDate,
    status: opts.status ?? 'completed',
    secretaryEmail: 'secretary@club.test',
  });
  const breedJudge = await makeJudge({
    name: 'Mrs Breed Judge',
    contactEmail: opts.breedJudgeEmail === undefined ? 'breed.judge@test.local' : opts.breedJudgeEmail,
  });
  const jhJudge = await makeJudge({ name: 'Mr JH Judge', contactEmail: 'jh.judge@test.local' });
  const sacJudge = await makeJudge({ name: 'Ms Special Awards', contactEmail: 'sac.judge@test.local' });
  await makeJudgeAssignment({ showId: s.id, judgeId: breedJudge.id, sex: 'dog' });
  await makeJudgeAssignment({ showId: s.id, judgeId: breedJudge.id, sex: 'bitch' });
  await makeJudgeAssignment({ showId: s.id, judgeId: jhJudge.id, sex: null });
  await makeJudgeAssignment({ showId: s.id, judgeId: sacJudge.id, sex: null, isSpecialAwardsClassesJudge: true });
  return { show: s, breedJudge, jhJudge, sacJudge, secretary: user };
}

const docsFor = (showId: string) =>
  testDb.query.critiqueDocuments.findMany({ where: eq(schema.critiqueDocuments.showId, showId) });

describe('the critique link goes to the judges two weeks after the show', () => {
  it('sends the breed judge and the Special Awards judge the link — never the Junior Handling judge — and tells the secretary', async () => {
    const { show: s, breedJudge, sacJudge } = await show();
    await runCritiqueAutoInvites(testDb, TODAY);

    const docs = await docsFor(s.id);
    const byJudge = new Map(docs.map((d) => [d.judgeId, d]));
    expect([...byJudge.keys()].sort()).toEqual([breedJudge.id, sacJudge.id].sort());
    expect(byJudge.get(breedJudge.id)).toMatchObject({ status: 'invited', invitedEmail: 'breed.judge@test.local' });
    expect(byJudge.get(sacJudge.id)).toMatchObject({ status: 'invited', invitedEmail: 'sac.judge@test.local' });
    expect(vi.mocked(sendCritiqueInviteEmail)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendCritiqueInviteEmail).mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          judgeName: 'Mrs Breed Judge',
          email: 'breed.judge@test.local',
          link: expect.stringContaining(byJudge.get(breedJudge.id)!.uploadToken),
        }),
        expect.objectContaining({ judgeName: 'Ms Special Awards', email: 'sac.judge@test.local' }),
      ]),
    );
    expect(vi.mocked(sendCritiqueAutoInviteNoticeEmail)).toHaveBeenCalledTimes(1);
    const notice = vi.mocked(sendCritiqueAutoInviteNoticeEmail).mock.calls[0]![0];
    expect(notice).toMatchObject({ secretaryEmail: 'secretary@club.test', noEmail: [] });
    expect([...notice.sentTo].sort()).toEqual(['Mrs Breed Judge', 'Ms Special Awards']);
  });

  it("a judge of the breed AND Junior Handling gets one link (North Eastern's judge, 11 Oct 2026)", async () => {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const s = await makeShow({
      organisationId: org.id, showType: 'championship', showScope: 'single_breed', showRuleset: 'rkc',
      breedId: breed.id, startDate: '2026-10-11', endDate: '2026-10-11', status: 'completed', secretaryEmail: 'sec@club.test',
    });
    const judge = await makeJudge({ name: 'Philippe Tran Ngoc An', contactEmail: 'pt@test.local' });
    await makeJudgeAssignment({ showId: s.id, judgeId: judge.id, sex: 'dog' });
    await makeJudgeAssignment({ showId: s.id, judgeId: judge.id, sex: 'bitch' });
    await makeJudgeAssignment({ showId: s.id, judgeId: judge.id, sex: null });
    await runCritiqueAutoInvites(testDb, TODAY);
    expect((await docsFor(s.id)).map((d) => d.judgeId)).toEqual([judge.id]);
    expect(vi.mocked(sendCritiqueInviteEmail)).toHaveBeenCalledTimes(1);
  });

  it('sends once — the next hourly run does nothing', async () => {
    const { show: s } = await show();
    await runCritiqueAutoInvites(testDb, TODAY);
    const tokens = (await docsFor(s.id)).map((d) => d.uploadToken).sort();
    await runCritiqueAutoInvites(testDb, '2026-10-26');
    // One email per judge (breed + Special Awards), none on the second run.
    expect(vi.mocked(sendCritiqueInviteEmail)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendCritiqueAutoInviteNoticeEmail)).toHaveBeenCalledTimes(1);
    expect((await docsFor(s.id)).map((d) => d.uploadToken).sort()).toEqual(tokens);
  });

  it('waits the full two weeks', async () => {
    const { show: s } = await show();
    await runCritiqueAutoInvites(testDb, '2026-10-24');
    expect(await docsFor(s.id)).toEqual([]);
    expect(vi.mocked(sendCritiqueInviteEmail)).not.toHaveBeenCalled();
  });

  it('leaves alone judges the secretary has already invited — and says nothing', async () => {
    const { show: s, breedJudge, sacJudge } = await show();
    const [doc] = await testDb
      .insert(schema.critiqueDocuments)
      .values({ showId: s.id, judgeId: breedJudge.id, status: 'invited', invitedEmail: 'own@test.local', invitedAt: new Date('2026-10-12T10:00:00Z') })
      .returning();
    await testDb
      .insert(schema.critiqueDocuments)
      .values({ showId: s.id, judgeId: sacJudge.id, status: 'invited', invitedEmail: 'sac.own@test.local', invitedAt: new Date('2026-10-12T10:00:00Z') });
    await runCritiqueAutoInvites(testDb, TODAY);
    const after = await testDb.query.critiqueDocuments.findFirst({ where: eq(schema.critiqueDocuments.id, doc!.id) });
    expect([after!.uploadToken, after!.invitedEmail]).toEqual([doc!.uploadToken, 'own@test.local']);
    expect(vi.mocked(sendCritiqueInviteEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(sendCritiqueAutoInviteNoticeEmail)).not.toHaveBeenCalled();
  });

  it('a judge with no email: nothing sent to them, the secretary is asked to send it — once', async () => {
    const { show: s, breedJudge } = await show({ breedJudgeEmail: null });
    await runCritiqueAutoInvites(testDb, TODAY);
    await runCritiqueAutoInvites(testDb, '2026-10-26');
    expect((await docsFor(s.id)).map((d) => d.judgeId)).not.toContain(breedJudge.id);
    expect(vi.mocked(sendCritiqueInviteEmail).mock.calls.map((c) => c[0].judgeName)).toEqual(['Ms Special Awards']);
    expect(vi.mocked(sendCritiqueAutoInviteNoticeEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendCritiqueAutoInviteNoticeEmail).mock.calls[0]![0]).toMatchObject({
      sentTo: ['Ms Special Awards'],
      noEmail: ['Mrs Breed Judge'],
    });
  });

  it('regional shows and cancelled shows get nothing', async () => {
    const regional = await show({ showRuleset: 'wusv' });
    const cancelled = await show({ status: 'cancelled' });
    await runCritiqueAutoInvites(testDb, TODAY);
    expect([...(await docsFor(regional.show.id)), ...(await docsFor(cancelled.show.id))]).toEqual([]);
    expect(vi.mocked(sendCritiqueInviteEmail)).not.toHaveBeenCalled();
  });

  it('a show that was never held gets nothing — a practice show left in draft, or one never opened', async () => {
    // Remi writes to judges only about a show that has been held: the hourly
    // job marks it 'completed' the midnight after its last day. A secretary's
    // practice show can carry real judges' email addresses.
    const draft = await show({ status: 'draft' });
    const neverOpened = await show({ status: 'published' });
    await runCritiqueAutoInvites(testDb, TODAY);
    expect([...(await docsFor(draft.show.id)), ...(await docsFor(neverOpened.show.id))]).toEqual([]);
    expect(vi.mocked(sendCritiqueInviteEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(sendCritiqueAutoInviteNoticeEmail)).not.toHaveBeenCalled();
  });

  it('never writes about an old show', async () => {
    const { show: s } = await show({ endDate: '2026-07-04' });
    await runCritiqueAutoInvites(testDb, '2026-09-30');
    expect(await docsFor(s.id)).toEqual([]);
  });

  it('a judge of two breeds at an all-breed show gets one link', async () => {
    const { org } = await makeSecretaryWithOrgAndBreed();
    const [b1, b2] = await Promise.all([makeBreed(), makeBreed()]);
    const s = await makeShow({
      organisationId: org.id, showType: 'championship', showScope: 'general', showRuleset: 'rkc',
      startDate: '2026-10-11', endDate: '2026-10-11', status: 'completed', secretaryEmail: 'sec@club.test',
    });
    const judge = await makeJudge({ name: 'All-rounder', contactEmail: 'ar@test.local' });
    await makeJudgeAssignment({ showId: s.id, judgeId: judge.id, breedId: b1.id });
    await makeJudgeAssignment({ showId: s.id, judgeId: judge.id, breedId: b2.id });
    await runCritiqueAutoInvites(testDb, TODAY);
    expect((await docsFor(s.id)).length).toBe(1);
    expect(vi.mocked(sendCritiqueInviteEmail)).toHaveBeenCalledTimes(1);
  });
});

describe('one gentle reminder, four weeks after the link, if nothing has come back', () => {
  async function invited(invitedAt: string, status: 'invited' | 'submitted' = 'invited') {
    const { show: s, breedJudge } = await show();
    const [doc] = await testDb
      .insert(schema.critiqueDocuments)
      .values({ showId: s.id, judgeId: breedJudge.id, status, invitedEmail: 'breed.judge@test.local', invitedAt: new Date(invitedAt) })
      .returning();
    return doc!;
  }

  it('reminds on the day with the same link, and only once', async () => {
    const doc = await invited('2026-10-25T09:00:00Z');
    await runCritiqueReminders(testDb, '2026-11-21');
    expect(vi.mocked(sendCritiqueReminderEmail)).not.toHaveBeenCalled();

    await runCritiqueReminders(testDb, '2026-11-22');
    await runCritiqueReminders(testDb, '2026-11-23');
    expect(vi.mocked(sendCritiqueReminderEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendCritiqueReminderEmail).mock.calls[0]![0]).toMatchObject({
      judgeName: 'Mrs Breed Judge',
      email: 'breed.judge@test.local',
      link: expect.stringContaining(doc.uploadToken),
    });
    const after = await testDb.query.critiqueDocuments.findFirst({ where: eq(schema.critiqueDocuments.id, doc.id) });
    expect(after!.reminderSentAt).not.toBeNull();
    expect(after!.uploadToken).toBe(doc.uploadToken);
  });

  it('no reminder once the critiques have come back', async () => {
    await invited('2026-10-25T09:00:00Z', 'submitted');
    await runCritiqueReminders(testDb, '2026-11-22');
    expect(vi.mocked(sendCritiqueReminderEmail)).not.toHaveBeenCalled();
  });

  it('also reminds a judge the secretary invited by hand', async () => {
    // The three judges invited on 30 Sept — reminded on 28 Oct.
    await invited('2026-09-30T18:32:00Z');
    await runCritiqueReminders(testDb, '2026-10-28');
    expect(vi.mocked(sendCritiqueReminderEmail)).toHaveBeenCalledTimes(1);
  });
});

describe('the Critiques page promises only what Remi will really send', () => {
  // listForShow reads the real clock, so these dates are relative to today.
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  async function reminderLine(invitedAt: Date) {
    const { show: s, breedJudge, secretary } = await show({ endDate: addCalendarDays(todayInLondon(), -100) });
    await testDb
      .insert(schema.critiqueDocuments)
      .values({ showId: s.id, judgeId: breedJudge.id, status: 'invited', invitedEmail: 'breed.judge@test.local', invitedAt });
    const rows = await createTestCaller(secretary).critiques.listForShow({ showId: s.id });
    return rows.find((r) => r.judgeId === breedJudge.id)!.reminderOn;
  }

  it('a link sent two days ago: the reminder date four weeks on', async () => {
    const invitedAt = daysAgo(2);
    expect(await reminderLine(invitedAt)).toBe(critiqueReminderDate(londonCalendarDateStr(invitedAt)));
  });

  it('the reminder day has just passed: it goes on the next hourly run, so the page says today', async () => {
    expect(await reminderLine(daysAgo(30))).toBe(todayInLondon());
  });

  it('a link sent ten weeks ago: no reminder is coming, so the page promises none', async () => {
    // The demo's Summer Championship show, 8 Oct 2026: "Remi will send a
    // reminder on 28 August 2026" — a date already gone, for a reminder the
    // hourly job would never send.
    expect(await reminderLine(daysAgo(70))).toBeNull();
  });
});

describe('one owner for sending the critique link', () => {
  it("the secretary's Invite button and the hourly job both go through services/critique-invites.ts", () => {
    const router = readFileSync(join(process.cwd(), 'src', 'server', 'trpc', 'routers', 'critiques.ts'), 'utf8');
    expect(router).toMatch(/inviteJudgeForCritiques\(/);
    expect(router).not.toMatch(/sendCritiqueInviteEmail/);
    const cron = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'cron', 'route.ts'), 'utf8');
    expect(cron).toMatch(/runCritiqueAutoInvites\(/);
    expect(cron).toMatch(/runCritiqueReminders\(/);
  });
});
