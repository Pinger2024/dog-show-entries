import { describe, expect, it } from 'vitest';
import { getRkcScheduleProfile } from '@/lib/rkc-schedule-profile';

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
