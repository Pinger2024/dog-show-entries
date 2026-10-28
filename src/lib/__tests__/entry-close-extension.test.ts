/**
 * RKC F(1)7.d as amended for 2027: a club may extend its ONLINE closing date
 * without the RKC's permission. Moving the POSTAL closing date still needs
 * permission plus an advertisement in the canine press — and Remi used to
 * treat the two dates identically, so a secretary could breach the
 * regulation from the edit dialog without being told.
 *
 * Mandy, 26 Oct 2026: show the extension publicly with the new date; do NOT
 * email exhibitors who have already entered.
 *
 * Two rules are pinned here:
 *  - `resolveEntryCloseExtension` — when the original date is remembered,
 *    kept and forgotten. It is the only thing that writes
 *    `shows.entryCloseExtendedFrom`.
 *  - `closeDateChangeHint` — what a secretary is told beside each picker,
 *    which is DATE-KEYED: a 2026 show needed permission for both dates, so
 *    the 2027 freedom must not be promised on a show that runs this year.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveEntryCloseExtension,
  entryCloseExtendedNotice,
  closeDateChangeHint,
} from '@/lib/entry-close-rules';

// Written the way the forms actually store them: 23:59 UK wall clock, which
// in May is BST (+01:00). A bare `...T23:59:00Z` would be 00:59 the NEXT day
// in London and the notice would name the wrong date — which is exactly what
// the first run of this test caught.
const ORIGINAL = '2027-05-01T23:59:00+01:00';
const LATER = '2027-05-08T23:59:00+01:00';
const LATER_STILL = '2027-05-15T23:59:00+01:00';
const EARLIER = '2027-04-24T23:59:00+01:00';

describe('resolveEntryCloseExtension', () => {
  it('remembers the date a club extended FROM', () => {
    expect(
      resolveEntryCloseExtension({ storedClose: ORIGINAL, nextClose: LATER, storedExtendedFrom: null }),
    ).toEqual(new Date(ORIGINAL));
  });

  it('keeps the FIRST original when a club extends a second time', () => {
    // The notice should compare against where the club started, not the last
    // hop — otherwise a show extended twice looks barely extended at all.
    expect(
      resolveEntryCloseExtension({ storedClose: LATER, nextClose: LATER_STILL, storedExtendedFrom: ORIGINAL }),
    ).toEqual(new Date(ORIGINAL));
  });

  it('counts a later TIME on the same day as an extension', () => {
    // Moving noon to 23:59 gives exhibitors most of a day they did not have.
    const noon = '2027-05-01T12:00:00+01:00';
    expect(
      resolveEntryCloseExtension({ storedClose: noon, nextClose: ORIGINAL, storedExtendedFrom: null }),
    ).toEqual(new Date(noon));
  });

  it('forgets it once the date is pulled back to the original', () => {
    expect(
      resolveEntryCloseExtension({ storedClose: LATER, nextClose: ORIGINAL, storedExtendedFrom: ORIGINAL }),
    ).toBeNull();
  });

  it('forgets it when the date is pulled back before the original', () => {
    expect(
      resolveEntryCloseExtension({ storedClose: LATER, nextClose: EARLIER, storedExtendedFrom: ORIGINAL }),
    ).toBeNull();
  });

  it('stays extended when pulled back but still later than the original', () => {
    expect(
      resolveEntryCloseExtension({ storedClose: LATER_STILL, nextClose: LATER, storedExtendedFrom: ORIGINAL }),
    ).toEqual(new Date(ORIGINAL));
  });

  it('is not an extension to set a closing date for the first time', () => {
    expect(
      resolveEntryCloseExtension({ storedClose: null, nextClose: LATER, storedExtendedFrom: null }),
    ).toBeNull();
  });

  it('clears when the closing date itself is cleared', () => {
    expect(
      resolveEntryCloseExtension({ storedClose: LATER, nextClose: null, storedExtendedFrom: ORIGINAL }),
    ).toBeNull();
  });

  it('leaves an unextended show alone when the date does not move', () => {
    expect(
      resolveEntryCloseExtension({ storedClose: ORIGINAL, nextClose: ORIGINAL, storedExtendedFrom: null }),
    ).toBeNull();
  });
});

describe('entryCloseExtendedNotice', () => {
  it('says nothing when the show was never extended', () => {
    expect(entryCloseExtendedNotice(LATER, null)).toBeNull();
  });

  it('names the UK day even when the viewer (or CI) is not in UK time', () => {
    // 00:30 on 9 May, UK — which is 23:30 on the 8th in UTC. A plain
    // local-time format would call this "8 May" on a UTC CI box and "9 May"
    // on the secretary's laptop. Shows are UK events; the UK day is the
    // answer everywhere.
    const justAfterMidnightUk = '2027-05-09T00:30:00+01:00';
    expect(entryCloseExtendedNotice(justAfterMidnightUk, ORIGINAL)).toContain('9 May');
  });

  it('names the NEW closing date, not the old one', () => {
    const notice = entryCloseExtendedNotice(LATER, ORIGINAL);
    expect(notice).toContain('extended');
    expect(notice).toContain('8 May');
    expect(notice).not.toContain('1 May');
  });
});

describe('closeDateChangeHint — what the secretary is told, by year', () => {
  const online = (startDate: string, showRuleset?: string) =>
    closeDateChangeHint({ field: 'entry close date', startDate, showRuleset });
  const postal = (startDate: string, showRuleset?: string) =>
    closeDateChangeHint({ field: 'postal close date', startDate, showRuleset });

  it('a 2026 show is told BOTH dates need the RKC', () => {
    expect(online('2026-08-09', 'rkc')).toMatch(/RKC must approve/i);
    expect(postal('2026-08-09', 'rkc')).toMatch(/RKC must approve/i);
  });

  it('a 2027 show may extend ONLINE entries without permission', () => {
    expect(online('2027-03-06', 'rkc')).toMatch(/extend this yourself/i);
    // The postal date is the whole point of the amendment: it did NOT change.
    expect(postal('2027-03-06', 'rkc')).toMatch(/RKC must approve/i);
  });

  it('the cut-over is the show date, not today', () => {
    // A show on 2 January 2027 has its schedule produced in 2026 and already
    // runs under the new regulations.
    expect(online('2026-12-31')).toMatch(/RKC must approve/i);
    expect(online('2027-01-02')).toMatch(/extend this yourself/i);
  });

  it('says nothing at all for a regional — the F regulations do not apply', () => {
    expect(online('2027-03-06', 'wusv')).toBeNull();
    expect(postal('2027-03-06', 'wusv')).toBeNull();
  });
});
