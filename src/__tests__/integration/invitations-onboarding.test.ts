import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { invitations, users, memberships } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeSecretaryWithOrg,
} from '../helpers/factories';

describe('invitations.send', () => {
  it('immediately accepts and assigns role when the invitee already has a Remi account', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const target = await makeUser({ role: 'exhibitor', email: 'becomesecretary@test.local' });

    const invite = await createTestCaller(secretary).invitations.send({
      email: target.email,
      role: 'secretary',
      organisationId: org.id,
    });

    expect(invite?.status).toBe('accepted');
    expect(invite?.acceptedById).toBe(target.id);

    // Role updated on the user; membership row inserted
    const u = await testDb.query.users.findFirst({ where: eq(users.id, target.id) });
    expect(u?.role).toBe('secretary');
    const m = await testDb.query.memberships.findFirst({
      where: eq(memberships.userId, target.id),
    });
    expect(m?.organisationId).toBe(org.id);
  });

  it('creates a pending invitation when the invitee has no account', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const invite = await createTestCaller(secretary).invitations.send({
      email: 'newcomer@test.local',
      role: 'steward',
      organisationId: org.id,
    });
    expect(invite?.status).toBe('pending');
    expect(invite?.token).toBeTruthy();
  });
});

describe('invitations.getByToken (public)', () => {
  it('returns invitation details for a valid pending token', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const invite = await createTestCaller(secretary).invitations.send({
      email: 'pending@test.local',
      role: 'steward',
      organisationId: org.id,
    });

    const publicCaller = createTestCaller(null);
    const data = await publicCaller.invitations.getByToken({ token: invite!.token });
    expect(data.email).toBe('pending@test.local');
    expect(data.status).toBe('pending');
    expect(data.organisationName).toBe(org.name);
  });

  it('reports expired status for tokens past their expiry', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const invite = await createTestCaller(secretary).invitations.send({
      email: 'expiredtoken@test.local',
      role: 'steward',
      organisationId: org.id,
    });
    // Force expiry by rewriting expiresAt into the past.
    await testDb.update(invitations).set({
      expiresAt: new Date(Date.now() - 60_000),
    }).where(eq(invitations.id, invite!.id));

    const data = await createTestCaller(null).invitations.getByToken({
      token: invite!.token,
    });
    expect(data.status).toBe('expired');
  });

  it('returns NOT_FOUND for an unknown token', async () => {
    await expect(
      createTestCaller(null).invitations.getByToken({ token: 'doesnt-exist' }),
    ).rejects.toThrow(/Invitation not found/);
  });
});

describe('invitations.accept', () => {
  it('promotes the accepting user to the invited role and links membership', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const acceptor = await makeUser({ role: 'exhibitor', email: 'accept@test.local' });
    const invite = await createTestCaller(secretary).invitations.send({
      email: 'accept@test.local',
      role: 'secretary',
      organisationId: org.id,
    });
    // The first send already auto-accepts because the user exists; the
    // accept procedure path requires a pending invite. Simulate by rolling
    // the invitation back to pending.
    await testDb.update(invitations).set({
      status: 'pending', acceptedById: null, acceptedAt: null,
    }).where(eq(invitations.id, invite!.id));

    const res = await createTestCaller(acceptor).invitations.accept({ token: invite!.token });
    expect(res.role).toBe('secretary');

    const refreshed = await testDb.query.invitations.findFirst({
      where: eq(invitations.id, invite!.id),
    });
    expect(refreshed?.status).toBe('accepted');
    expect(refreshed?.acceptedById).toBe(acceptor.id);
  });

  it('rejects acceptance if the caller\'s email differs from the invitation', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const wrongUser = await makeUser({ role: 'exhibitor', email: 'wrong@test.local' });
    const invite = await createTestCaller(secretary).invitations.send({
      email: 'intended@test.local', role: 'steward', organisationId: org.id,
    });

    await expect(
      createTestCaller(wrongUser).invitations.accept({ token: invite!.token }),
    ).rejects.toThrow(/different email address/);
  });

  it('rejects an expired invitation and marks it expired', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const acceptor = await makeUser({ role: 'exhibitor', email: 'late@test.local' });
    const invite = await createTestCaller(secretary).invitations.send({
      email: 'late@test.local', role: 'steward', organisationId: org.id,
    });
    await testDb.update(invitations).set({
      status: 'pending', acceptedById: null, acceptedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    }).where(eq(invitations.id, invite!.id));

    await expect(
      createTestCaller(acceptor).invitations.accept({ token: invite!.token }),
    ).rejects.toThrow(/expired/);

    const refreshed = await testDb.query.invitations.findFirst({
      where: eq(invitations.id, invite!.id),
    });
    expect(refreshed?.status).toBe('expired');
  });
});

describe('invitations.list + revoke (secretary)', () => {
  it('lists the secretary\'s own invitations', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(secretary);
    await caller.invitations.send({ email: 'a@test.local', role: 'steward', organisationId: org.id });
    await caller.invitations.send({ email: 'b@test.local', role: 'steward', organisationId: org.id });
    const list = await caller.invitations.list();
    expect(list).toHaveLength(2);
  });

  it('revokes a pending invitation', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(secretary);
    const invite = await caller.invitations.send({
      email: 'r@test.local', role: 'steward', organisationId: org.id,
    });
    await caller.invitations.revoke({ id: invite!.id });
    const refreshed = await testDb.query.invitations.findFirst({
      where: eq(invitations.id, invite!.id),
    });
    expect(refreshed?.status).toBe('revoked');
  });

  it('rejects revoking another secretary\'s invitation', async () => {
    const { user: a, org: orgA } = await makeSecretaryWithOrg();
    const { user: b } = await makeSecretaryWithOrg();
    const invite = await createTestCaller(a).invitations.send({
      email: 'invitee@test.local', role: 'steward', organisationId: orgA.id,
    });
    await expect(
      createTestCaller(b).invitations.revoke({ id: invite!.id }),
    ).rejects.toThrow(/your own invitations/);
  });
});

describe('onboarding flow', () => {
  it('getStatus reports profile completeness based on user fields', async () => {
    const incomplete = await makeUser({ role: 'exhibitor', name: '', address: null, postcode: null });
    const complete = await makeUser({
      role: 'exhibitor',
      name: 'Full Name',
      address: '1 Full Lane',
      postcode: 'AB1 2CD',
    });

    const incompleteStatus = await createTestCaller(incomplete).onboarding.getStatus();
    expect(incompleteStatus.hasProfile).toBe(false);
    expect(incompleteStatus.isComplete).toBe(false);

    const completeStatus = await createTestCaller(complete).onboarding.getStatus();
    expect(completeStatus.hasProfile).toBe(true);
  });

  it('saveProfile writes name + address + postcode (+optional phone, kcAccountNo)', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const res = await createTestCaller(user).onboarding.saveProfile({
      name: 'Onboard User',
      address: '99 Onboard St',
      postcode: 'OB1 2CD',
      phone: '07700999888',
      kcAccountNo: 'KCXX',
    });
    expect(res.name).toBe('Onboard User');
    expect(res.kcAccountNo).toBe('KCXX');
  });

  it('complete sets onboardingCompletedAt', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const res = await createTestCaller(user).onboarding.complete();
    expect(res.success).toBe(true);
    const refreshed = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(refreshed?.onboardingCompletedAt).toBeInstanceOf(Date);
  });
});
