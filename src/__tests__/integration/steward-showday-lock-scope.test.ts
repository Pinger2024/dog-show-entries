/**
 * Who may see the entry list BEFORE show day.
 *
 * Mandy 2026-08-21: "only me, Michael and the show secretary … I don't want any
 * of the other committee to be able to see who has entered at all."
 *
 * The old rule let through ANY active member of the host organisation. That
 * happened to match her intent only because the sole membership rows in
 * existence were staff — a membership is a CLUB membership (it carries an expiry
 * and drives the members' entry discount), so once a club adds real members they
 * would each have gained a silent early view of the entry list.
 *
 * The shared-secretary case must survive: South Western ran Denise Hensley (the
 * show's secretary_user_id) alongside Ann Swift, who is a secretary-role member
 * of the club and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeStewardAssignment,
  makeMembership,
} from '../helpers/factories';

/** A show whose first day is comfortably in the future, so the lock is active. */
async function futureShowWithEntry() {
  const [org, breed, exhibitor] = await Promise.all([makeOrg(), makeBreed(), makeUser({ role: 'exhibitor' })]);
  const namedSecretary = await makeUser({ role: 'secretary' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_closed',
    startDate: '2099-01-01',
    endDate: '2099-01-01',
    secretaryUserId: namedSecretary.id,
  });
  const [showClass, dog] = await Promise.all([
    makeShowClass({ showId: show.id, breedId: breed.id }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
    status: 'confirmed',
  });
  await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { org, breed, show, showClass, namedSecretary };
}

/** Everyone needs a steward assignment to reach the procedure at all. */
async function seesEntries(user: { id: string; email: string; name: string | null; role: string }, showId: string, showClassId: string) {
  await makeStewardAssignment({ userId: user.id, showId });
  const res = await createTestCaller(user).steward.getClassEntries({ showClassId });
  return { locked: !!res.lockedUntilShowDay, count: res.entries.length };
}

describe('show-day lock — who sees the entry list early', () => {
  it('lets an admin through', async () => {
    const { show, showClass } = await futureShowWithEntry();
    const admin = await makeUser({ role: 'admin' });
    const { locked, count } = await seesEntries(admin, show.id, showClass.id);
    expect(locked).toBe(false);
    expect(count).toBe(1);
  });

  it("lets the show's named secretary through", async () => {
    const { show, showClass, namedSecretary } = await futureShowWithEntry();
    const { locked, count } = await seesEntries(namedSecretary, show.id, showClass.id);
    expect(locked).toBe(false);
    expect(count).toBe(1);
  });

  it('lets a co-secretary through — the South Western arrangement', async () => {
    // Ann Swift: secretary role + active membership of the host club, but NOT
    // the show's secretary_user_id. Mandy confirmed this must keep working.
    const { org, show, showClass } = await futureShowWithEntry();
    const coSecretary = await makeUser({ role: 'secretary' });
    await makeMembership({ userId: coSecretary.id, organisationId: org.id, status: 'active' });
    const { locked, count } = await seesEntries(coSecretary, show.id, showClass.id);
    expect(locked).toBe(false);
    expect(count).toBe(1);
  });

  it('KEEPS OUT A COMMITTEE MEMBER WHO IS ALSO STEWARDING', async () => {
    // The whole point of the change, and the realistic shape of it: a committee
    // member helps out as a steward on the day AND holds a club membership.
    // Under the old rule that membership alone unlocked the full entry list
    // weeks early. They steward; they don't get an early look.
    const { org, show, showClass } = await futureShowWithEntry();
    const committeeSteward = await makeUser({ role: 'steward' });
    await makeMembership({ userId: committeeSteward.id, organisationId: org.id, status: 'active' });
    const { locked, count } = await seesEntries(committeeSteward, show.id, showClass.id);
    expect(locked).toBe(true);
    expect(count).toBe(0);
  });

  it('refuses an ordinary club member outright — they never reach the steward page', async () => {
    // A committee member with no steward role is stopped a step earlier, by the
    // role gate, even with an assignment row. Belt and braces.
    const { org, show, showClass } = await futureShowWithEntry();
    const member = await makeUser({ role: 'exhibitor' });
    await makeMembership({ userId: member.id, organisationId: org.id, status: 'active' });
    await makeStewardAssignment({ userId: member.id, showId: show.id });
    await expect(
      createTestCaller(member).steward.getClassEntries({ showClassId: showClass.id }),
    ).rejects.toThrow(/Steward, secretary, or admin access required/);
  });

  it('keeps an ordinary steward out', async () => {
    const { show, showClass } = await futureShowWithEntry();
    const steward = await makeUser({ role: 'steward' });
    const { locked, count } = await seesEntries(steward, show.id, showClass.id);
    expect(locked).toBe(true);
    expect(count).toBe(0);
  });

  it("keeps out a secretary of a DIFFERENT club", async () => {
    const { show, showClass } = await futureShowWithEntry();
    const otherOrg = await makeOrg();
    const otherClubSecretary = await makeUser({ role: 'secretary' });
    await makeMembership({ userId: otherClubSecretary.id, organisationId: otherOrg.id, status: 'active' });
    const { locked, count } = await seesEntries(otherClubSecretary, show.id, showClass.id);
    expect(locked).toBe(true);
    expect(count).toBe(0);
  });

  it('keeps out a secretary whose membership of the host club has lapsed', async () => {
    const { org, show, showClass } = await futureShowWithEntry();
    const lapsed = await makeUser({ role: 'secretary' });
    await makeMembership({ userId: lapsed.id, organisationId: org.id, status: 'expired' });
    const { locked, count } = await seesEntries(lapsed, show.id, showClass.id);
    expect(locked).toBe(true);
    expect(count).toBe(0);
  });
});
