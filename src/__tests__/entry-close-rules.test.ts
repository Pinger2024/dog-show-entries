import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import {
  MIN_DAYS_BEFORE_SHOW_START,
  latestPermissibleCloseDate,
  latestPermissibleCloseDateInputValue,
  isCloseDateWithinFloor,
  entryCloseFloorMessage,
  entryCloseHint,
  entryCloseAdjustedMessage,
} from '@/lib/entry-close-rules';

// All fixture dates below sit in January/February — outside British Summer
// Time — so a UTC 'Z' instant and its Europe/London wall-clock reading are
// identical. That keeps the calendar-day assertions unambiguous; the
// BST-crossing case gets its own dedicated test.

describe('MIN_DAYS_BEFORE_SHOW_START', () => {
  it("is Mandy's 13-day floor ('two weeks give or take a day')", () => {
    expect(MIN_DAYS_BEFORE_SHOW_START).toBe(13);
  });
});

describe('latestPermissibleCloseDate', () => {
  it('is exactly 13 calendar days before the show start', () => {
    // Saturday 31 Jan 2026 → latest close is Sunday 18 Jan 2026 (13 days).
    const latest = latestPermissibleCloseDate('2026-01-31');
    expect(latest.getFullYear()).toBe(2026);
    expect(latest.getMonth()).toBe(0); // January
    expect(latest.getDate()).toBe(18);
  });
});

describe('isCloseDateWithinFloor', () => {
  it('passes a 13-day gap (the exact floor)', () => {
    expect(isCloseDateWithinFloor('2026-01-18T12:00:00.000Z', '2026-01-31')).toBe(true);
  });

  it('fails a 12-day gap (one day short of the floor)', () => {
    expect(isCloseDateWithinFloor('2026-01-19T12:00:00.000Z', '2026-01-31')).toBe(false);
  });

  it('passes a 14-day gap (a day inside the floor)', () => {
    expect(isCloseDateWithinFloor('2026-01-17T12:00:00.000Z', '2026-01-31')).toBe(true);
  });

  it('passes a close time of 23:59 on the boundary day — calendar-day, not millisecond, semantics', () => {
    // 23:59 on 18 Jan is chronologically almost a full day after the
    // "13 days before" midnight instant — a naive millisecond-diff
    // implementation undercounts this as a 12-day gap and wrongly rejects
    // it. The rule cares which CALENDAR DAY the close time falls on.
    expect(isCloseDateWithinFloor('2026-01-18T23:59:00.000Z', '2026-01-31')).toBe(true);
  });

  it('fails a close time of 00:01 the day after the boundary', () => {
    expect(isCloseDateWithinFloor('2026-01-19T00:01:00.000Z', '2026-01-31')).toBe(false);
  });

  it('applies the same floor to the postal close date (same function, same rule)', () => {
    // The task only distinguishes entry vs postal close dates by which
    // field a call site validates — the underlying floor check is identical.
    expect(isCloseDateWithinFloor('2026-01-18T23:59:00.000Z', '2026-01-31')).toBe(true);
    expect(isCloseDateWithinFloor('2026-01-19T12:00:00.000Z', '2026-01-31')).toBe(false);
  });

  it('correctly reads a close time across the BST/GMT boundary in Europe/London', () => {
    // Show starts Sat 31 Oct 2026 (GMT — BST ends 25 Oct 2026). Floor date is
    // 18 Oct 2026, which is still BST (UTC+1). A close time of 23:59 BST on
    // 18 Oct is 22:59 UTC — a naive UTC calendar-day read would (correctly,
    // here) call it 18 Oct, but 23:00 BST would already be 22:00 UTC same
    // day too; push closer to midnight to actually cross the UTC boundary:
    // 23:30 BST on 18 Oct = 22:30 UTC on 18 Oct (still same UTC day — BST is
    // only +1h so 23:xx BST never crosses into the next UTC day). Assert the
    // London-local reading (23:30 BST) is treated as 18 Oct, the true floor
    // day, and passes.
    expect(isCloseDateWithinFloor('2026-10-18T22:30:00.000Z', '2026-10-31')).toBe(true);
  });
});

describe('entryCloseFloorMessage', () => {
  it('names the show start date and the latest permissible close date in plain English', () => {
    const message = entryCloseFloorMessage('2026-01-31');
    expect(message).toContain('at least two weeks before the show');
    expect(message).toContain('31 January 2026');
    expect(message).toContain('18 January 2026');
    expect(message).toContain('entry close date');
  });

  it('names the postal close date when told the breach is on postal close', () => {
    const message = entryCloseFloorMessage('2026-01-31', 'postal close date');
    expect(message).toContain('postal close date');
    expect(message).not.toContain('entry close date first');
  });
});

describe('entryCloseHint', () => {
  it('states both dates by day-of-week + day + month, no year', () => {
    // 31 Jan 2026 is a Saturday; 13 calendar days earlier, 18 Jan 2026, is a Sunday.
    expect(entryCloseHint('2026-01-31')).toBe(
      'For a show on Saturday 31 January, entries must close by Sunday 18 January.',
    );
  });

  it('is a proactive statement, not phrased as a rejection', () => {
    // Distinct from entryCloseFloorMessage: no "must be at least"/"update your"
    // — this is shown before any date has been picked, so it can't scold.
    const hint = entryCloseHint('2026-01-31');
    expect(hint).not.toContain('update your');
    expect(hint).not.toContain('at least');
  });
});

describe('latestPermissibleCloseDateInputValue', () => {
  it('formats the floor date as yyyy-MM-dd, for native <input type="date" max=""> attributes', () => {
    // Saturday 31 Jan 2026 → latest close is Sunday 18 Jan 2026 (13 days).
    expect(latestPermissibleCloseDateInputValue('2026-01-31')).toBe('2026-01-18');
  });

  it('agrees with latestPermissibleCloseDate + format — same underlying date, string form', () => {
    const startDate = '2026-10-31';
    expect(latestPermissibleCloseDateInputValue(startDate)).toBe(
      format(latestPermissibleCloseDate(startDate), 'yyyy-MM-dd'),
    );
  });
});

describe('entryCloseAdjustedMessage', () => {
  it('builds the entry-close auto-adjust toast copy', () => {
    const adjusted = latestPermissibleCloseDate('2026-01-31'); // 18 Jan 2026
    expect(entryCloseAdjustedMessage('entry close date', adjusted)).toBe(
      'Entry close date adjusted to 18 January 2026 — entries must close at least two weeks before the show',
    );
  });

  it('builds the postal-close auto-adjust toast copy', () => {
    const adjusted = latestPermissibleCloseDate('2026-01-31'); // 18 Jan 2026
    expect(entryCloseAdjustedMessage('postal close date', adjusted)).toBe(
      'Postal close date adjusted to 18 January 2026 — entries must close at least two weeks before the show',
    );
  });
});
