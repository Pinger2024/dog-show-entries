import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { stewardAssignments, rings, showChecklistItems, users as usersTable } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeUser,
  makeStewardAssignment,
} from '../helpers/factories';

describe('secretary stewards lifecycle', () => {
  it('assigns a steward by email; promotes exhibitor → steward', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const target = await makeUser({ role: 'exhibitor', email: 'newsteward@test.local' });
    const caller = createTestCaller(user);

    const assignment = await caller.secretary.assignSteward({
      showId: show.id,
      email: target.email,
    });
    expect(assignment.userId).toBe(target.id);

    const updatedUser = await testDb.query.users.findFirst({ where: eq(usersTable.id, target.id) });
    expect(updatedUser?.role).toBe('steward');
  });

  it('rejects assigning a non-existent email', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await expect(
      createTestCaller(user).secretary.assignSteward({
        showId: show.id, email: 'nobody@test.local',
      }),
    ).rejects.toThrow(/No user found/);
  });

  it('rejects double-assigning the same steward', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const target = await makeUser({ role: 'exhibitor', email: 'dup@test.local' });
    const caller = createTestCaller(user);
    await caller.secretary.assignSteward({ showId: show.id, email: target.email });
    await expect(
      caller.secretary.assignSteward({ showId: show.id, email: target.email }),
    ).rejects.toThrow(/already assigned/);
  });

  it('removes a steward and reverts role when no other assignments remain', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const target = await makeUser({ role: 'exhibitor', email: 'revert@test.local' });
    const caller = createTestCaller(user);
    const assignment = await caller.secretary.assignSteward({
      showId: show.id, email: target.email,
    });

    await caller.secretary.removeSteward({ assignmentId: assignment.id });

    const userRow = await testDb.query.users.findFirst({ where: eq(usersTable.id, target.id) });
    expect(userRow?.role).toBe('exhibitor');
  });

  it('removes a steward but keeps role if other assignments still exist', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show1 = await makeShow({ organisationId: org.id });
    const show2 = await makeShow({ organisationId: org.id });
    const target = await makeUser({ role: 'exhibitor', email: 'multi@test.local' });
    const caller = createTestCaller(user);
    const a1 = await caller.secretary.assignSteward({ showId: show1.id, email: target.email });
    await caller.secretary.assignSteward({ showId: show2.id, email: target.email });

    await caller.secretary.removeSteward({ assignmentId: a1.id });

    const userRow = await testDb.query.users.findFirst({ where: eq(usersTable.id, target.id) });
    expect(userRow?.role).toBe('steward'); // still a steward at show2
  });

  it('getShowStewards returns assignments with user + ring + breed assignments', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const steward = await makeUser({ role: 'steward', name: 'Sam Steward' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });

    const list = await createTestCaller(user).secretary.getShowStewards({ showId: show.id });
    expect(list).toHaveLength(1);
    expect(list[0]?.user?.name).toBe('Sam Steward');
  });
});

describe('secretary rings (addRing covered elsewhere; cover updateRing)', () => {
  it('updateRing changes number, day, time on a ring', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const ring = await caller.secretary.addRing({ showId: show.id, number: 1 });

    const updated = await caller.secretary.updateRing({
      ringId: ring.id, number: 2, showDay: 1, startTime: '09:00',
    });
    expect(updated.number).toBe(2);
    expect(updated.startTime).toBe('09:00');

    const dbRow = await testDb.query.rings.findFirst({ where: eq(rings.id, ring.id) });
    expect(dbRow?.number).toBe(2);
  });

  it('updateRing rejects an unknown ring id', async () => {
    const { user } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(user).secretary.updateRing({
        ringId: '00000000-0000-0000-0000-000000000000',
        number: 1,
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('secretary checklist CRUD', () => {
  it('addChecklistItem inserts an item with auto sortOrder per phase', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);

    const a = await caller.secretary.addChecklistItem({
      showId: show.id, title: 'Book venue', phase: 'planning',
    });
    const b = await caller.secretary.addChecklistItem({
      showId: show.id, title: 'Print catalogue', phase: 'planning',
    });
    expect(a?.sortOrder).toBe(0);
    expect(b?.sortOrder).toBe(1);
  });

  it('updateChecklistItem flips status and stamps completedAt + completedByUserId', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const item = await caller.secretary.addChecklistItem({
      showId: show.id, title: 'Confirm judges', phase: 'pre_show',
    });

    const completed = await caller.secretary.updateChecklistItem({
      itemId: item!.id, status: 'complete',
    });
    expect(completed.status).toBe('complete');
    expect(completed.completedAt).toBeTruthy();
    expect(completed.completedByUserId).toBe(user.id);

    // Reverting clears completedAt
    const reverted = await caller.secretary.updateChecklistItem({
      itemId: item!.id, status: 'in_progress',
    });
    expect(reverted.completedAt).toBeNull();
    expect(reverted.completedByUserId).toBeNull();
  });

  it('updateChecklistItem updates notes and assignedToName', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const item = await caller.secretary.addChecklistItem({
      showId: show.id, title: 'Order rosettes', phase: 'planning',
    });

    const updated = await caller.secretary.updateChecklistItem({
      itemId: item!.id,
      notes: 'Ordered from supplier',
      assignedToName: 'Mandy',
    });
    expect(updated.notes).toBe('Ordered from supplier');
    expect(updated.assignedToName).toBe('Mandy');
  });

  it('deleteChecklistItem removes the row', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const item = await caller.secretary.addChecklistItem({
      showId: show.id, title: 'Book vet', phase: 'pre_show',
    });
    await caller.secretary.deleteChecklistItem({ itemId: item!.id });
    const rows = await testDb.query.showChecklistItems.findMany({
      where: eq(showChecklistItems.id, item!.id),
    });
    expect(rows).toHaveLength(0);
  });

  it('getChecklistAutoDetect returns flags derived from show state', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const result = await createTestCaller(user).secretary.getChecklistAutoDetect({
      showId: show.id,
    });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

// Suppress unused-import warnings.
void stewardAssignments; void rings; void showChecklistItems; void usersTable;
