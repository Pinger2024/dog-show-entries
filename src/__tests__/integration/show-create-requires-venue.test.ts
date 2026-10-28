/**
 * Mandy, 28 Oct 2026: "lets make sure we dont allow a show to bypass venue
 * selection". The new-show wizard used to let step 2 be skipped, and a show
 * created without a venue then had no screen that could give it one.
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrgAndBreed, makeVenue } from '../helpers/factories';

const base = (orgId: string, breedId: string) => ({
  name: 'Venue Rule Show',
  showType: 'open' as const,
  showScope: 'single_breed' as const,
  organisationId: orgId,
  breedId,
  startDate: '2030-06-01',
  endDate: '2030-06-01',
});

describe('shows.create: a show cannot bypass choosing its venue', () => {
  it('refuses a show with no venue', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    await expect(
      createTestCaller(user).shows.create(base(org.id, breed.id) as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('creates the show with the venue attached', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const venue = await makeVenue({ organisationId: org.id, name: 'Sidewood Canine Services' });
    const created = await createTestCaller(user).shows.create({
      ...base(org.id, breed.id),
      venueId: venue.id,
    });
    expect(created.venueId).toBe(venue.id);
  });
});
