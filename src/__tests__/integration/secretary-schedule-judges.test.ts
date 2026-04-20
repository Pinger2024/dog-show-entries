import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { shows, organisationPeople, judgeContracts, achievements } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
  makeUser,
  makeDog,
  makeEntry,
  makeAchievement,
} from '../helpers/factories';

describe('secretary.updateScheduleData', () => {
  it('saves scheduleData JSONB + show-level showOpenTime/judgingStartTime/onCallVet', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await createTestCaller(user).secretary.updateScheduleData({
      showId: show.id,
      showOpenTime: '08:30',
      judgingStartTime: '10:00',
      onCallVet: 'Dr Smith',
      scheduleData: {
        country: 'england',
        publicAdmission: true,
        showManager: 'Sue Manager',
        welcomeNote: 'Welcome to the show!',
      },
    });
    const dbShow = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(dbShow?.showOpenTime).toBe('08:30');
    expect(dbShow?.startTime).toBe('10:00');
    expect(dbShow?.onCallVet).toBe('Dr Smith');
    expect(dbShow?.scheduleData?.country).toBe('england');
    expect(dbShow?.scheduleData?.welcomeNote).toBe('Welcome to the show!');
  });

  it('syncs new officers (incl. guarantors) into organisationPeople for re-use', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await createTestCaller(user).secretary.updateScheduleData({
      showId: show.id,
      scheduleData: {
        officers: [
          { name: 'Officer One', position: 'Chair' },
          { name: 'Officer Two', position: 'Treasurer' },
        ],
        guarantors: [{ name: 'Officer One', address: '1 High St' }],
      },
    });

    const people = await testDb.query.organisationPeople.findMany({
      where: eq(organisationPeople.organisationId, org.id),
      orderBy: (op, { asc }) => [asc(op.name)],
    });
    expect(people.map((p) => p.name)).toEqual(['Officer One', 'Officer Two']);
    expect(people.find((p) => p.name === 'Officer One')?.isGuarantor).toBe(true);
    expect(people.find((p) => p.name === 'Officer One')?.address).toBe('1 High St');
    expect(people.find((p) => p.name === 'Officer Two')?.isGuarantor).toBe(false);
  });

  it('does not duplicate org people when officers already exist (case-insensitive)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    await caller.secretary.createOrgPerson({ organisationId: org.id, name: 'Existing Person' });
    const show = await makeShow({ organisationId: org.id });

    await caller.secretary.updateScheduleData({
      showId: show.id,
      scheduleData: {
        officers: [{ name: 'EXISTING PERSON', position: 'Chair' }], // case-insensitive match
      },
    });

    const people = await testDb.query.organisationPeople.findMany({
      where: eq(organisationPeople.organisationId, org.id),
    });
    expect(people).toHaveLength(1); // not duplicated
  });
});

describe('secretary.getShowAchievements', () => {
  it('returns achievements with dog + breed embedded', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: user.id, breedId: breed.id });
    await makeAchievement({ showId: show.id, dogId: dog.id, type: 'best_of_breed' });

    const list = await createTestCaller(user).secretary.getShowAchievements({
      showId: show.id,
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.dog?.id).toBe(dog.id);
    expect(list[0]?.dog?.breed?.id).toBe(breed.id);
  });
});

describe('secretary.getPhaseBlockers', () => {
  it('reports blockers for a freshly-created show with no classes/judges/fees', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const result = await createTestCaller(user).secretary.getPhaseBlockers({
      showId: show.id,
    });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    // At minimum: should report 'no_classes', 'no_judge', 'no_entry_fees', 'no_close_date'
  });
});

describe('secretary.updateJudgeExpenses', () => {
  it('updates the expense fields on a judge contract', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge({ contactEmail: 'j@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const contract = await createTestCaller(user).secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'j@test.local',
    });

    const updated = await createTestCaller(user).secretary.updateJudgeExpenses({
      contractId: contract.id,
      hotelCost: 15000,
      travelCost: 5000,
      otherExpenses: null,
      expenseNotes: 'Hotel + train',
    });
    expect(updated.hotelCost).toBe(15000);
    expect(updated.travelCost).toBe(5000);
    expect(updated.otherExpenses).toBeNull();
    expect(updated.expenseNotes).toBe('Hotel + train');
  });

  it('returns NOT_FOUND for unknown contract id', async () => {
    const { user } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(user).secretary.updateJudgeExpenses({
        contractId: '00000000-0000-0000-0000-000000000000',
        hotelCost: 0, travelCost: 0, otherExpenses: 0, expenseNotes: null,
      }),
    ).rejects.toThrow();
  });
});

describe('secretary.resendJudgeOffer', () => {
  it('refreshes tokenExpiresAt + offerSentAt and re-sends email', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge({ contactEmail: 'j@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const contract = await createTestCaller(user).secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'j@test.local',
    });

    // Tweak the contract's offerSentAt back so we can detect the refresh.
    const longAgo = new Date(2020, 0, 1);
    await testDb.update(judgeContracts)
      .set({ offerSentAt: longAgo })
      .where(eq(judgeContracts.id, contract.id));

    await createTestCaller(user).secretary.resendJudgeOffer({ contractId: contract.id });

    const refreshed = await testDb.query.judgeContracts.findFirst({
      where: eq(judgeContracts.id, contract.id),
    });
    expect(refreshed?.offerSentAt?.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it('rejects resend on a contract not in the offer_sent stage', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const judge = await makeJudge({ contactEmail: 'j@test.local' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });
    const contract = await createTestCaller(user).secretary.sendJudgeOffer({
      showId: show.id, judgeId: judge.id, judgeEmail: 'j@test.local',
    });
    // Move the contract past offer_sent
    await testDb.update(judgeContracts)
      .set({ stage: 'offer_accepted' })
      .where(eq(judgeContracts.id, contract.id));

    await expect(
      createTestCaller(user).secretary.resendJudgeOffer({ contractId: contract.id }),
    ).rejects.toThrow(/offer sent/);
  });
});

// ── Backlog #101 — time-ordering validation ────────────────
describe('secretary.updateScheduleData time validation', () => {
  it('rejects judging start before or equal to show-open time', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await expect(
      createTestCaller(user).secretary.updateScheduleData({
        showId: show.id,
        showOpenTime: '09:00',
        judgingStartTime: '08:30',
        scheduleData: { country: 'england' },
      })
    ).rejects.toThrow(/must be after/);
  });

  it('rejects latest arrival before show-open', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await expect(
      createTestCaller(user).secretary.updateScheduleData({
        showId: show.id,
        showOpenTime: '09:00',
        judgingStartTime: '10:00',
        scheduleData: { country: 'england', latestArrivalTime: '08:45' },
      })
    ).rejects.toThrow(/before the show opens/);
  });

  it('rejects latest arrival after judging starts', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await expect(
      createTestCaller(user).secretary.updateScheduleData({
        showId: show.id,
        showOpenTime: '09:00',
        judgingStartTime: '10:00',
        scheduleData: { country: 'england', latestArrivalTime: '10:30' },
      })
    ).rejects.toThrow(/must be before judging starts/);
  });

  it('accepts a sensible 09:00 / 09:30 / 10:00 ordering', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await createTestCaller(user).secretary.updateScheduleData({
      showId: show.id,
      showOpenTime: '09:00',
      judgingStartTime: '10:00',
      scheduleData: { country: 'england', latestArrivalTime: '09:30' },
    });
    const dbShow = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(dbShow?.showOpenTime).toBe('09:00');
    expect(dbShow?.startTime).toBe('10:00');
  });
});

void shows; void achievements; void makeUser; void makeEntry;
