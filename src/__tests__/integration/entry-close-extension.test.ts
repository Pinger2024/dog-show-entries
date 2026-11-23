/**
 * RKC F(1)7.d for 2027 — a club may extend its ONLINE closing date without
 * the RKC's permission — through `shows.update`, the only path that writes
 * it. Mandy, 26 Oct 2026: show it publicly with the new date, email nobody
 * who has already entered.
 *
 * The unit rules are pinned in lib/__tests__/entry-close-extension.test.ts.
 * This is the wiring: that `shows.update` actually records the original
 * closing date, keeps it across a second extension, and forgets it when the
 * club pulls the date back in — because a show that quietly keeps saying
 * "entries have been extended" after the club changed its mind is worse than
 * one that never said it.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrgAndBreed, makeShow } from '../helpers/factories';

/** Well clear of the 13-day floor, so only the extension rule is in play. */
const SHOW_START = '2030-06-14';
const ORIGINAL_CLOSE = new Date('2030-05-01T22:59:00.000Z').toISOString();
const EXTENDED_CLOSE = new Date('2030-05-08T22:59:00.000Z').toISOString();
const EXTENDED_AGAIN = new Date('2030-05-15T22:59:00.000Z').toISOString();

async function showWithCloseDate() {
  const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    startDate: SHOW_START,
    endDate: SHOW_START,
    entryCloseDate: new Date(ORIGINAL_CLOSE),
  });
  return { caller: createTestCaller(user), show };
}

const stored = async (id: string) =>
  testDb.query.shows.findFirst({ where: eq(shows.id, id) });

describe('shows.update — extending the online closing date', () => {
  it('records the date the club extended FROM', async () => {
    const { caller, show } = await showWithCloseDate();
    await caller.shows.update({ id: show.id, entryCloseDate: EXTENDED_CLOSE });

    const after = await stored(show.id);
    expect(after?.entryCloseDate?.toISOString()).toBe(EXTENDED_CLOSE);
    expect(after?.entryCloseExtendedFrom?.toISOString()).toBe(ORIGINAL_CLOSE);
  });

  it('keeps the FIRST original when the club extends again', async () => {
    const { caller, show } = await showWithCloseDate();
    await caller.shows.update({ id: show.id, entryCloseDate: EXTENDED_CLOSE });
    await caller.shows.update({ id: show.id, entryCloseDate: EXTENDED_AGAIN });

    const after = await stored(show.id);
    expect(after?.entryCloseExtendedFrom?.toISOString()).toBe(ORIGINAL_CLOSE);
  });

  it('forgets it when the club pulls the date back to where it started', async () => {
    const { caller, show } = await showWithCloseDate();
    await caller.shows.update({ id: show.id, entryCloseDate: EXTENDED_CLOSE });
    await caller.shows.update({ id: show.id, entryCloseDate: ORIGINAL_CLOSE });

    const after = await stored(show.id);
    expect(after?.entryCloseExtendedFrom).toBeNull();
  });

  it('does not mark a show extended when an unrelated field is saved', async () => {
    const { caller, show } = await showWithCloseDate();
    await caller.shows.update({ id: show.id, name: 'Renamed Show' });

    const after = await stored(show.id);
    expect(after?.name).toBe('Renamed Show');
    expect(after?.entryCloseExtendedFrom).toBeNull();
  });

  it('leaves the POSTAL closing date alone — it has no extension record', async () => {
    // Moving the postal date still needs the RKC's permission, so Remi never
    // advertises it as a free extension. The secretary is warned beside the
    // picker instead (CloseDateRuleHint).
    const { caller, show } = await showWithCloseDate();
    await caller.shows.update({ id: show.id, postalCloseDate: EXTENDED_CLOSE });

    const after = await stored(show.id);
    expect(after?.postalCloseDate?.toISOString()).toBe(EXTENDED_CLOSE);
    expect(after?.entryCloseExtendedFrom).toBeNull();
  });
});
