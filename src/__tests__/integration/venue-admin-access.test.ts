/**
 * 28 Oct 2026: verifyOrgAccess had no admin path. Mandy — a platform admin,
 * not a member of the GSD Club of Scotland — could edit the club's show
 * (verifyShowAccess lets admins through) but would have been FORBIDDEN from
 * listing or adding its venues, so the new venue picker was a dead end for
 * the person who needed it most. No postcode here: createVenue geocodes a
 * postcode via postcodes.io and tests never call external services.
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeSecretaryWithOrg } from '../helpers/factories';

describe('venues: an admin who is not a club member', () => {
  it('can list and add venues for the club', async () => {
    const { org } = await makeSecretaryWithOrg();
    const admin = await makeUser({ role: 'admin' });
    const caller = createTestCaller(admin);

    const venue = await caller.secretary.createVenue({
      organisationId: org.id,
      name: 'Sidewood Canine Services',
      address: 'Blackhill Road, Forth, Lanark',
    });
    expect(venue.organisationId).toBe(org.id);

    const list = await caller.secretary.listVenues({ organisationId: org.id });
    expect(list.map((v) => v.id)).toContain(venue.id);
  });

  it('a non-member who is not an admin is still refused', async () => {
    const { org } = await makeSecretaryWithOrg();
    const stranger = await makeUser({ role: 'secretary' });
    const caller = createTestCaller(stranger);

    await expect(caller.secretary.listVenues({ organisationId: org.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      caller.secretary.createVenue({ organisationId: org.id, name: 'Not allowed' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
