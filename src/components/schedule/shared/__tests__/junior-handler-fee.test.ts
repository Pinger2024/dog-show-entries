import { describe, it, expect } from 'vitest';
import { juniorHandlerFeeForSchedule } from '../junior-handler-fee';
import type { ScheduleClass } from '../types';

// The helper only reads classType; cast minimal fixtures.
const cls = (classType: string): ScheduleClass => ({ classType } as ScheduleClass);
const JH = cls('junior_handler');
const OPEN = cls('achievement');

describe('juniorHandlerFeeForSchedule', () => {
  it('shows the fee (£0) when there are JH classes but the fee is blank (the GSD Scotland case)', () => {
    // Regression: this used to return null and drop the row.
    expect(juniorHandlerFeeForSchedule(null, [OPEN, JH])).toBe(0);
    expect(juniorHandlerFeeForSchedule(undefined, [JH])).toBe(0);
  });

  it('shows an explicit £0 fee (the Clyde Valley case)', () => {
    expect(juniorHandlerFeeForSchedule(0, [OPEN, JH])).toBe(0);
  });

  it('shows a non-zero fee unchanged', () => {
    expect(juniorHandlerFeeForSchedule(300, [OPEN, JH])).toBe(300);
  });

  it('still shows a set fee even with no JH classes (never regress an existing row)', () => {
    expect(juniorHandlerFeeForSchedule(0, [OPEN])).toBe(0);
    expect(juniorHandlerFeeForSchedule(300, [OPEN])).toBe(300);
  });

  it('omits the row (null) only when there are no JH classes AND no fee set', () => {
    expect(juniorHandlerFeeForSchedule(null, [OPEN])).toBeNull();
    expect(juniorHandlerFeeForSchedule(undefined, [])).toBeNull();
  });
});
