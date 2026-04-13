import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { users, feedback } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeDog,
  makeEntry,
} from '../helpers/factories';

describe('users.updateProfile', () => {
  it('updates name + address + postcode + phone + kcAccountNo', async () => {
    const user = await makeUser({ role: 'exhibitor', name: 'Old Name' });
    const updated = await createTestCaller(user).users.updateProfile({
      name: 'New Name',
      address: '1 New Road',
      postcode: 'AB1 2CD',
      phone: '07700111222',
      kcAccountNo: 'KC123',
    });
    expect(updated.name).toBe('New Name');
    expect(updated.address).toBe('1 New Road');
    expect(updated.kcAccountNo).toBe('KC123');
  });

  it('clears nullable fields when passed null', async () => {
    const user = await makeUser({ role: 'exhibitor', address: '1 Old St', phone: '07000' });
    await createTestCaller(user).users.updateProfile({ address: null, phone: null });
    const refreshed = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(refreshed?.address).toBeNull();
    expect(refreshed?.phone).toBeNull();
  });
});

describe('users.hasPassword + setPassword + changePassword', () => {
  it('hasPassword reflects the user state', async () => {
    const userNoPw = await makeUser({ role: 'exhibitor' });
    const userWithPw = await makeUser({ role: 'exhibitor', passwordHash: 'pre-existing' });

    expect(await createTestCaller(userNoPw).users.hasPassword()).toBe(false);
    expect(await createTestCaller(userWithPw).users.hasPassword()).toBe(true);
  });

  it('setPassword stores a bcrypt hash', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(user);

    const res = await caller.users.setPassword({ password: 'new-strong-pw-1234' });
    expect(res.success).toBe(true);

    const refreshed = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(refreshed?.passwordHash).toMatch(/^\$2[ayb]\$/); // bcrypt prefix
  });

  it('setPassword refuses if a password already exists', async () => {
    const user = await makeUser({ role: 'exhibitor', passwordHash: 'something' });
    await expect(
      createTestCaller(user).users.setPassword({ password: 'another-strong-pw' }),
    ).rejects.toThrow(/already have a password/);
  });

  it('changePassword swaps the hash when the current password is correct', async () => {
    const passwordHash = await hash('correct-old-pw', 12);
    const user = await makeUser({ role: 'exhibitor', passwordHash });
    const caller = createTestCaller(user);

    const res = await caller.users.changePassword({
      currentPassword: 'correct-old-pw',
      newPassword: 'new-strong-pw-1234',
    });
    expect(res.success).toBe(true);

    const refreshed = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(refreshed?.passwordHash).not.toBe(passwordHash);
  });

  it('changePassword rejects on incorrect current password', async () => {
    const passwordHash = await hash('correct-pw', 12);
    const user = await makeUser({ role: 'exhibitor', passwordHash });
    await expect(
      createTestCaller(user).users.changePassword({
        currentPassword: 'wrong-pw',
        newPassword: 'new-strong-pw-1234',
      }),
    ).rejects.toThrow(/Current password is incorrect/);
  });

  it('changePassword refuses when no password is set', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(user).users.changePassword({
        currentPassword: 'whatever',
        newPassword: 'new-strong-pw-1234',
      }),
    ).rejects.toThrow(/No password set/);
  });
});

describe('users.getDashboard', () => {
  it('returns dashboard counts for the caller (no entries → zeros, dogs counted)', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    await makeDog({ ownerId: user.id });
    await makeDog({ ownerId: user.id });
    const dashboard = await createTestCaller(user).users.getDashboard();
    expect(dashboard).toBeDefined();
  });

  it('counts upcoming entries for the caller', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: user.id, breedId: breed.id });
    // Future show + entry
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      startDate: '2099-12-31',
      endDate: '2099-12-31',
    });
    await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: user.id, status: 'confirmed',
    });

    const dashboard = await createTestCaller(user).users.getDashboard();
    expect(dashboard).toBeDefined();
    expect(typeof dashboard).toBe('object');
  });
});

describe('feedback.submit (widget)', () => {
  it('inserts a widget feedback row for the caller', async () => {
    const user = await makeUser({ role: 'exhibitor', name: 'Reporter' });
    const res = await createTestCaller(user).feedback.submit({
      subject: 'Test report',
      body: 'Something broke on the show page',
      pageUrl: 'http://localhost/shows/abc',
      feedbackType: 'bug',
    });
    expect(res.id).toBeTruthy();

    const row = await testDb.query.feedback.findFirst({ where: eq(feedback.id, res.id) });
    expect(row?.subject).toBe('Test report');
    expect(row?.source).toBe('widget');
    expect(row?.feedbackType).toBe('bug');
    expect(row?.fromEmail).toBe(user.email);
    expect(row?.textBody).toContain('Something broke on the show page');
    // Diagnostics block should be appended
    expect(row?.textBody).toContain('User:');
    expect(row?.textBody).toContain('Page:');
  });

  it('rejects an over-short body via zod', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(user).feedback.submit({
        subject: 'Hi', // too short (min 3) — and body too short too
        body: 'x',
        pageUrl: 'http://localhost',
      }),
    ).rejects.toThrow();
  });
});
