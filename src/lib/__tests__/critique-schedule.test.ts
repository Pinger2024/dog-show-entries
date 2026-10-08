import { describe, it, expect } from 'vitest';
import {
  critiqueAutoSendPhase,
  critiqueInviteDate,
  critiqueReminderDate,
  isCritiqueInviteDue,
  upcomingAutoInviteDate,
  upcomingReminderDate,
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
    // The hourly job sends it on the day this returns "today".
    expect(upcomingReminderDate('2026-10-25', '2026-10-11', '2026-11-21')).toBe('2026-11-22');
    expect(upcomingReminderDate('2026-10-25', '2026-10-11', '2026-11-22')).toBe('2026-11-22');
    expect(upcomingReminderDate('2026-10-25', '2026-10-11', '2027-02-01')).toBeNull();
  });

  it("the Critiques page never promises a reminder that won't happen", () => {
    // Reminder day passed, next hourly run catches up: "today".
    expect(upcomingReminderDate('2026-10-25', '2026-10-11', '2026-11-24')).toBe('2026-11-24');
    // The demo's Summer Championship show (8 Oct 2026): link sent 31 July, so
    // the reminder fell on 28 August and its two weeks ran out on 11 Sept.
    // The page said "Remi will send a reminder on 28 August 2026".
    expect(upcomingReminderDate('2026-07-31', '2026-05-30', '2026-10-08')).toBeNull();
  });

  it('never reminds a judge before the show has been held', () => {
    // Invited by hand on 1 Oct for a show ending 1 Nov: four weeks is 29 Oct,
    // but the show is only 'completed' the day after its last day.
    expect(upcomingReminderDate('2026-10-01', '2026-11-01', '2026-10-02')).toBe('2026-11-02');
    // Invited months ahead: the reminder's fortnight is over before the show
    // is even held, so Remi never sends one and the page never promises it.
    expect(upcomingReminderDate('2026-10-01', '2026-12-10', '2026-10-02')).toBeNull();
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

  it('writes only about a show that has been held — never a draft or a cancelled show', () => {
    expect(critiqueAutoSendPhase('completed')).toBe('now');
    for (const s of ['published', 'entries_open', 'entries_closed', 'in_progress']) {
      expect(critiqueAutoSendPhase(s)).toBe('later');
    }
    expect(critiqueAutoSendPhase('draft')).toBe('never');
    expect(critiqueAutoSendPhase('cancelled')).toBe('never');
  });
});
