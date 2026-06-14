import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { shows, venues } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';

// Mandy 2026-06-14: the Schedule setup step showed "Complete" the instant any
// schedule field autosaved, because the wizard only checked
// `show.scheduleData != null`. The fix is a server-computed
// getChecklistAutoDetect.schedule_complete = venue set AND show-day times set.
describe('schedule step completion (schedule_complete)', () => {
  it('is FALSE on a brand-new show (no venue, no times)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    const caller = createTestCaller(user);

    const detect = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(detect.schedule_complete).toBe(false);
  });

  it('is FALSE when scheduleData is non-null but venue+times are unset (the exact reported bug)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    // Simulate "touched one field on the schedule form": scheduleData is now
    // non-null. The OLD logic (scheduleData != null) ticked complete here.
    await testDb
      .update(shows)
      .set({ scheduleData: { directions: 'Turn left at the church' } })
      .where(eq(shows.id, show.id));
    const caller = createTestCaller(user);

    const detect = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(detect.schedule_complete).toBe(false);
  });

  it('is FALSE with show-day times set but no venue', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    await testDb
      .update(shows)
      .set({ showOpenTime: '08:30', startTime: '09:30' })
      .where(eq(shows.id, show.id));
    const caller = createTestCaller(user);

    const detect = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(detect.schedule_complete).toBe(false);
  });

  it('is FALSE with a venue but no times', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    const [venue] = await testDb
      .insert(venues)
      .values({ name: 'Acorn Hall', organisationId: org.id })
      .returning();
    await testDb.update(shows).set({ venueId: venue!.id }).where(eq(shows.id, show.id));
    const caller = createTestCaller(user);

    const detect = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(detect.schedule_complete).toBe(false);
  });

  it('is TRUE only when venue AND show-open AND judging-start are all set, and stays stable', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    const [venue] = await testDb
      .insert(venues)
      .values({ name: 'Acorn Hall', organisationId: org.id })
      .returning();
    await testDb
      .update(shows)
      .set({ venueId: venue!.id, showOpenTime: '08:30', startTime: '09:30' })
      .where(eq(shows.id, show.id));
    const caller = createTestCaller(user);

    const detect = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(detect.schedule_complete).toBe(true);
    // No flapping — same inputs, same answer on a second read.
    const again = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(again.schedule_complete).toBe(true);
  });

  it('updateScheduleData creates+links a venue and flips schedule_complete; a blank name leaves it alone', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    const caller = createTestCaller(user);

    // Set venue (name+address, deliberately no postcode → no geocode network)
    // plus the show-day times, the way the schedule form's autosave does.
    await caller.secretary.updateScheduleData({
      showId: show.id,
      showOpenTime: '08:30',
      judgingStartTime: '09:30',
      venue: { name: 'Strathclyde Country Park', address: '366 Hamilton Road' },
      scheduleData: { country: 'scotland' },
    });

    const row = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(row?.venueId).toBeTruthy();
    const linked = await testDb.query.venues.findFirst({ where: eq(venues.id, row!.venueId!) });
    expect(linked?.name).toBe('Strathclyde Country Park');
    expect(linked?.address).toBe('366 Hamilton Road');
    expect(linked?.organisationId).toBe(org.id);

    const detect = await caller.secretary.getChecklistAutoDetect({ showId: show.id });
    expect(detect.schedule_complete).toBe(true);

    // A blank venue name on a later autosave tick must NOT unlink the venue
    // or spawn an empty duplicate.
    await caller.secretary.updateScheduleData({
      showId: show.id,
      venue: { name: '   ' },
      scheduleData: { catering: 'Tea and cake' },
    });
    const afterBlank = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(afterBlank?.venueId).toBe(row?.venueId);
    const orgVenues = await testDb.select().from(venues).where(eq(venues.organisationId, org.id));
    expect(orgVenues).toHaveLength(1);
  });

  it('renaming the venue updates it in place — no orphan row', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'draft' });
    const caller = createTestCaller(user);

    await caller.secretary.updateScheduleData({
      showId: show.id,
      venue: { name: 'Acorn Hal' }, // typo
      scheduleData: {},
    });
    const row1 = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    const firstVenueId = row1?.venueId;
    expect(firstVenueId).toBeTruthy();

    await caller.secretary.updateScheduleData({
      showId: show.id,
      venue: { name: 'Acorn Hall' }, // fixed
      scheduleData: {},
    });
    const row2 = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(row2?.venueId).toBe(firstVenueId); // same venue, updated in place

    const linked = await testDb.query.venues.findFirst({ where: eq(venues.id, firstVenueId!) });
    expect(linked?.name).toBe('Acorn Hall');
    const orgVenues = await testDb.select().from(venues).where(eq(venues.organisationId, org.id));
    expect(orgVenues).toHaveLength(1); // no orphan left behind
  });
});
