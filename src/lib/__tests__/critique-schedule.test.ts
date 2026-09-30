import { describe, it, expect } from 'vitest';
import {
  critiqueInviteDate,
  critiqueReminderDate,
  isCritiqueInviteDue,
  isCritiqueReminderDue,
  upcomingAutoInviteDate,
} from '@/lib/critique-schedule';

// Mandy confirmed these exact dates (Telegram, 30 Sept 2026).
describe('critique link dates — two weeks after the show, reminder four weeks after the link', () => {
  it('North Eastern on 11 Oct: link on 25 Oct, reminder on 22 Nov', () => {
    expect(critiqueInviteDate('2026-10-11')).toBe('2026-10-25');
    expect(critiqueReminderDate('2026-10-25')).toBe('2026-11-22');
  });

  it("today's three invites (30 Sept) are reminded on 28 Oct", () => {
    expect(critiqueReminderDate('2026-09-30')).toBe('2026-10-28');
  });

  it('the link is not due the day before, is due on the day, and catches up after a missed run', () => {
    expect(isCritiqueInviteDue('2026-10-11', '2026-10-24')).toBe(false);
    expect(isCritiqueInviteDue('2026-10-11', '2026-10-25')).toBe(true);
    expect(isCritiqueInviteDue('2026-10-11', '2026-10-27')).toBe(true);
  });

  it('never writes to a judge about an old show', () => {
    // 19 Class Championship, 4 July — months before the automatic send began.
    expect(isCritiqueInviteDue('2026-07-04', '2026-09-30')).toBe(false);
  });

  it('the reminder waits four weeks and is never sent months late', () => {
    expect(isCritiqueReminderDue('2026-10-25', '2026-11-21')).toBe(false);
    expect(isCritiqueReminderDue('2026-10-25', '2026-11-22')).toBe(true);
    expect(isCritiqueReminderDue('2026-10-25', '2027-02-01')).toBe(false);
  });

  it('crosses the end of British Summer Time without slipping a day', () => {
    expect(critiqueInviteDate('2026-10-20')).toBe('2026-11-03');
  });

  it("the Critiques page never promises a date that won't happen", () => {
    expect(upcomingAutoInviteDate('2026-10-11', '2026-10-12')).toBe('2026-10-25');
    // Send date passed, next hourly run catches up: "today".
    expect(upcomingAutoInviteDate('2026-10-11', '2026-10-27')).toBe('2026-10-27');
    // Too old for Remi to send — the secretary's to send by hand.
    expect(upcomingAutoInviteDate('2026-07-04', '2026-09-30')).toBeNull();
  });
});
