import { describe, it, expect } from 'vitest';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeDog,
  makeShow,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';
import { createTestCaller } from '../helpers/context';

/** A YYYY-MM-DD date string `days` from today (judgeIntel window is +90 days). */
function dateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('dashboard.getSummary — judgeIntel', () => {
  // Amanda 2026-06-01: Hugh De Zutter appeared twice in "Judge Insights" for
  // the same South Western show because he had separate dog + bitch
  // assignments (plus stale breed-null rows). The panel must show each judge
  // once per show+breed.
  it('lists a judge once per show despite separate dog + bitch assignments', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    // The user owns a dog of this breed → breed lands in userBreedIds.
    await makeDog({ ownerId: user.id, breedId: breed.id });
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      startDate: dateStr(30),
      endDate: dateStr(30),
    });
    const judge = await makeJudge({ name: 'Hugh De Zutter' });
    // Same judge, two assignments for the user's breed (dogs and bitches).
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'dog' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id, sex: 'bitch' });

    const summary = await createTestCaller(user).dashboard.getSummary();
    const hughRows = summary.judgeIntel.filter(
      (j) => j.judgeName === 'Hugh De Zutter' && j.showId === show.id,
    );
    expect(hughRows).toHaveLength(1);
  });
});
