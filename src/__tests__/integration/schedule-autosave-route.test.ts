import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { POST as autosavePOST } from '@/app/api/schedule-autosave/[showId]/route';
import { shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';
import type { ScheduleData } from '@/server/db/schema';

/**
 * Regression coverage for the 2026-04-22 incident where the
 * Schedule form's unmount beacon fired with blank default state
 * (officers=[], no showManager) before the client finished
 * hydrating, silently wiping Amanda's officer list. The server-side
 * guard in the beacon route is the final backstop — if a client
 * regression ever sends an unhydrated payload again, this test
 * proves the server refuses the write.
 */

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

function mockAuthedAs(user: { id: string; email: string | null; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function beaconRequest(showId: string, body: unknown) {
  return new Request(`http://localhost/api/schedule-autosave/${showId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = (showId: string) => ({ params: Promise.resolve({ showId }) });

const BLANK_DEFAULT_PAYLOAD = {
  scheduleData: {
    country: 'england',
    publicAdmission: false,
    wetWeatherAccommodation: false,
    isBenched: false,
    acceptsNfc: true,
    judgedOnGroupSystem: false,
    officers: [],
    guarantors: [],
  },
};

const POPULATED_EXISTING: ScheduleData = {
  country: 'england',
  publicAdmission: false,
  wetWeatherAccommodation: false,
  isBenched: false,
  acceptsNfc: true,
  judgedOnGroupSystem: false,
  showManager: 'Mr Andrew Winfrow',
  officers: [
    { name: 'Mrs D Gater', position: 'President' },
    { name: 'Mr Bob Honey', position: 'Chairman' },
  ],
  guarantors: [
    { name: 'Mrs D Gater' },
    { name: 'Mr Bob Honey' },
  ],
  awardsDescription: 'Trophies 1st to 3rd in all classes',
};

describe('POST /api/schedule-autosave/[showId] — wipe protection', () => {
  it('refuses a blank default payload when existing scheduleData is populated', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, scheduleData: POPULATED_EXISTING });
    mockAuthedAs(user);

    const res = await autosavePOST(
      beaconRequest(show.id, BLANK_DEFAULT_PAYLOAD) as never,
      params(show.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe('suspicious-wipe');

    const dbShow = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(dbShow?.scheduleData?.showManager).toBe('Mr Andrew Winfrow');
    expect(dbShow?.scheduleData?.officers).toHaveLength(2);
    expect(dbShow?.scheduleData?.guarantors).toHaveLength(2);
    expect(dbShow?.scheduleData?.awardsDescription).toBe('Trophies 1st to 3rd in all classes');
  });

  it('accepts the same blank payload when existing scheduleData is also blank (fresh form)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    mockAuthedAs(user);

    const res = await autosavePOST(
      beaconRequest(show.id, BLANK_DEFAULT_PAYLOAD) as never,
      params(show.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skipped).toBeUndefined();
  });

  it('accepts a payload with real user content (one officer) even if most fields are default', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, scheduleData: POPULATED_EXISTING });
    mockAuthedAs(user);

    const res = await autosavePOST(
      beaconRequest(show.id, {
        scheduleData: {
          ...BLANK_DEFAULT_PAYLOAD.scheduleData,
          showManager: 'Someone Different',
          officers: [{ name: 'Someone Different', position: 'Show Manager' }],
        },
      }) as never,
      params(show.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBeUndefined();

    const dbShow = await testDb.query.shows.findFirst({ where: eq(shows.id, show.id) });
    expect(dbShow?.scheduleData?.showManager).toBe('Someone Different');
    expect(dbShow?.scheduleData?.officers).toHaveLength(1);
  });
});
