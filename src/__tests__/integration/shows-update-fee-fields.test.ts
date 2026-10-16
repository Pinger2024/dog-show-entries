import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';

/**
 * Regression: Amanda 2026-05-19 hit a bug where the multi-dog package
 * "Applies from" + "Package price" fields didn't persist after the wizard
 * saved. Lock the wire-through so the tRPC + DB path can't silently drop
 * these fields again.
 */
describe('shows.update — fee + multi-dog persistence', () => {
  it('persists multi-dog threshold + package price', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      status: 'draft',
    });
    const caller = createTestCaller(secretary);

    await caller.shows.update({
      id: show.id,
      firstEntryFee: 2000,
      multiDogThreshold: 3,
      multiDogPackagePence: 5600,
    });

    const reloaded = await testDb.query.shows.findFirst({
      where: eq(shows.id, show.id),
    });
    expect(reloaded?.firstEntryFee).toBe(2000);
    expect(reloaded?.multiDogThreshold).toBe(3);
    expect(reloaded?.multiDogPackagePence).toBe(5600);
  });

  it('clears multi-dog fields when null is sent (Remove multi-dog package button)', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      status: 'draft',
    });
    const caller = createTestCaller(secretary);

    // First save the fields...
    await caller.shows.update({
      id: show.id,
      multiDogThreshold: 3,
      multiDogPackagePence: 5600,
    });

    // ...then clear them.
    await caller.shows.update({
      id: show.id,
      multiDogThreshold: null,
      multiDogPackagePence: null,
    });

    const reloaded = await testDb.query.shows.findFirst({
      where: eq(shows.id, show.id),
    });
    expect(reloaded?.multiDogThreshold).toBeNull();
    expect(reloaded?.multiDogPackagePence).toBeNull();
  });

  it('persists multi-dog fields alongside entry fee changes (StepDetails handleSave shape)', async () => {
    // Mirrors the exact payload shape that setup-wizard.tsx StepDetails
    // sends — Amanda's bug was that this payload's multi-dog values
    // never made it to the DB despite first_entry_fee landing fine.
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      status: 'draft',
    });
    const caller = createTestCaller(secretary);

    await caller.shows.update({
      id: show.id,
      firstEntryFee: 2000,
      subsequentEntryFee: null,
      nfcEntryFee: null,
      juniorHandlerFee: 0,
      multiDogThreshold: 3,
      multiDogPackagePence: 5600,
      secretaryName: null,
      secretaryEmail: null,
      secretaryPhone: null,
      secretaryAddress: null,
      kcLicenceNo: null,
      entryCloseDate: null,
      postalCloseDate: null,
    });

    const reloaded = await testDb.query.shows.findFirst({
      where: eq(shows.id, show.id),
    });
    expect(reloaded?.firstEntryFee).toBe(2000);
    expect(reloaded?.multiDogThreshold).toBe(3);
    expect(reloaded?.multiDogPackagePence).toBe(5600);
  });
});
