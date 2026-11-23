import { describe, expect, it } from 'vitest';
import {
  getRkcScheduleProfile,
  getRkcRegulationYear,
  RKC_SCHEDULE_SPECIMEN_VERSIONS,
} from '@/lib/rkc-schedule-profile';

describe('getRkcScheduleProfile', () => {
  it.each([
    ['open', 'single_breed', false, 'SCHEDULE OF UNBENCHED OPEN SINGLE BREED SHOW'],
    ['limited', 'single_breed', false, 'SCHEDULE OF UNBENCHED LIMITED SINGLE BREED SHOW'],
    ['championship', 'single_breed', false, 'SCHEDULE OF UNBENCHED BREED CHAMPIONSHIP SHOW'],
    ['open', 'general', true, 'SCHEDULE OF UNBENCHED OPEN SHOW JUDGED ON THE GROUP SYSTEM'],
    ['open', 'general', false, 'SCHEDULE OF UNBENCHED OPEN SHOW NOT JUDGED ON THE GROUP SYSTEM'],
    ['limited', 'general', true, 'SCHEDULE OF UNBENCHED LIMITED SHOW JUDGED ON THE GROUP SYSTEM'],
    ['limited', 'general', false, 'SCHEDULE OF UNBENCHED LIMITED SHOW NOT JUDGED ON THE GROUP SYSTEM'],
    ['championship', 'general', true, 'SCHEDULE OF UNBENCHED GENERAL CHAMPIONSHIP SHOW'],
    ['championship', 'group', true, 'SCHEDULE OF UNBENCHED GROUP CHAMPIONSHIP SHOW'],
  ])('selects the current specimen title for %s/%s', (showType, showScope, judgedOnGroupSystem, title) => {
    expect(getRkcScheduleProfile({ showType, showScope, judgedOnGroupSystem }).title).toBe(title);
  });

  it('only permits Baby Puppy classes at single-breed club shows', () => {
    expect(getRkcScheduleProfile({ showType: 'open', showScope: 'single_breed' }).allowsBabyPuppy).toBe(true);
    expect(getRkcScheduleProfile({ showType: 'open', showScope: 'general' }).allowsBabyPuppy).toBe(false);
  });

  it('uses the RKC 2026 class minima', () => {
    expect(getRkcScheduleProfile({ showType: 'open', showScope: 'single_breed' }).minimumClasses).toBe(12);
    expect(getRkcScheduleProfile({ showType: 'open', showScope: 'general' }).minimumClasses).toBe(16);
  });
});

/**
 * The 2027 F-regulation cut-over. The RKC's 2027 amendments take effect for
 * shows whose FIRST DAY is on or after 1 January 2027 — not for schedules
 * merely produced after that date, which is the trap: a January 2027 show is
 * printed in December 2026 and already follows the new rules.
 */
describe('getRkcRegulationYear', () => {
  it.each([
    ['2026-01-01', 2026],
    ['2026-12-31', 2026],
    ['2027-01-01', 2027],
    ['2027-12-31', 2027],
    ['2028-08-26', 2027],
  ])('a show starting %s runs under the %i regulations', (startDate, expected) => {
    expect(getRkcRegulationYear(startDate)).toBe(expected);
  });

  it('reads the calendar year off the date string, so no timezone can shift it', () => {
    // A Postgres `date` arrives as 'YYYY-MM-DD'. CI runs UTC as the proof
    // (project_document_dates_utc_bug_2026-09-03) — a 1 January show must not
    // fall back to 2026 because somewhere it parsed as 31 December 23:00.
    expect(getRkcRegulationYear('2027-01-01')).toBe(2027);
    expect(getRkcRegulationYear('2027-01-01T00:00:00.000Z')).toBe(2027);
    expect(getRkcRegulationYear('2026-12-31T23:59:59.000Z')).toBe(2026);
  });

  it('accepts a Date', () => {
    expect(getRkcRegulationYear(new Date(2027, 0, 1))).toBe(2027);
    expect(getRkcRegulationYear(new Date(2026, 11, 31))).toBe(2026);
  });

  it('falls back to today when a draft has no date yet, so the default cannot go stale', () => {
    const thisYear = new Date().getFullYear();
    expect(getRkcRegulationYear(undefined)).toBe(thisYear >= 2027 ? 2027 : 2026);
    expect(getRkcRegulationYear(null)).toBe(thisYear >= 2027 ? 2027 : 2026);
    expect(getRkcRegulationYear('')).toBe(thisYear >= 2027 ? 2027 : 2026);
  });
});

describe('getRkcScheduleProfile — regulation edition', () => {
  it('carries the regulation year and the matching specimen version', () => {
    const y2026 = getRkcScheduleProfile({ showType: 'championship', showScope: 'single_breed', startDate: '2026-11-15' });
    expect(y2026.regulationYear).toBe(2026);
    expect(y2026.specimenVersion).toBe(RKC_SCHEDULE_SPECIMEN_VERSIONS[2026]);

    const y2027 = getRkcScheduleProfile({ showType: 'championship', showScope: 'single_breed', startDate: '2027-03-06' });
    expect(y2027.regulationYear).toBe(2027);
    expect(y2027.specimenVersion).toBe(RKC_SCHEDULE_SPECIMEN_VERSIONS[2027]);
  });

  it('leaves everything else about the show alone across the cut-over', () => {
    const base = { showType: 'championship', showScope: 'single_breed' } as const;
    const before = getRkcScheduleProfile({ ...base, startDate: '2026-11-15' });
    const after = getRkcScheduleProfile({ ...base, startDate: '2027-03-06' });
    expect(after.title).toBe(before.title);
    expect(after.designation).toBe(before.designation);
    expect(after.minimumClasses).toBe(before.minimumClasses);
    expect(after.minimumPuppyAgeMonths).toBe(before.minimumPuppyAgeMonths);
    expect(after.allowsBabyPuppy).toBe(before.allowsBabyPuppy);
  });
});
