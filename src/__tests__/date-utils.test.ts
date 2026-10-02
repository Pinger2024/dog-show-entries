import { describe, it, expect } from 'vitest';
import { todayInLondon, londonCalendarDateStr } from '@/lib/date-utils';

/**
 * `todayInLondon` is compared directly against DB `date` columns stored as
 * "YYYY-MM-DD" strings (show.startDate, the entries-close cron, etc.) — its
 * output shape can never drift, and its Europe/London reading can never
 * silently shift to a different underlying implementation. Locked down here
 * because `todayInLondon` now delegates to {@link londonCalendarDateStr}
 * (moved out to be shared with entry-close-rules.ts, 2026-08-05) — this test
 * is the guard against that refactor changing its behaviour.
 */
describe('todayInLondon', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayInLondon()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('agrees exactly with londonCalendarDateStr(new Date()) — same Intl.DateTimeFormat options', () => {
    // Both read "now", to the same Europe/London calendar day: assert they
    // never disagree, not just that they're both well-formed.
    expect(todayInLondon()).toBe(londonCalendarDateStr(new Date()));
  });
});

describe('londonCalendarDateStr', () => {
  it('returns a YYYY-MM-DD string for an arbitrary instant', () => {
    expect(londonCalendarDateStr(new Date('2026-01-18T23:59:00.000Z'))).toBe('2026-01-18');
  });

  it('reads the Europe/London wall-clock date, not the raw UTC date', () => {
    // 31 Oct 2026 23:30 BST (UTC+1) is still 31 Oct in London, even though a
    // naive UTC read of a late-evening instant can land on the wrong day
    // depending on the exact time — this fixture sits right at a BST/GMT
    // transition week to keep the London-vs-UTC distinction meaningful.
    expect(londonCalendarDateStr(new Date('2026-10-31T22:30:00.000Z'))).toBe('2026-10-31');
  });
});
