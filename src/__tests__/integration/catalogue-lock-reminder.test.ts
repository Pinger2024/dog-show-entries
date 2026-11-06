/**
 * Mandy, 30 Sept 2026 (bug-hunt question 4, second half): when she downloads a
 * catalogue to print, a gentle "Lock the numbers now?" reminder — yes. A
 * prompt, never a block: "Just open" always works (catalogue lock decision,
 * 22 Sept — never block printing).
 *
 * Midland 2026 went to print unlocked; two later withdrawals then left gaps,
 * and a Lock press at that point would have re-sorted the printed numbers.
 *
 * Remind only once entries have closed (numbers are provisional before) and
 * only while the numbers are unlocked. Secretary print catalogues only — the
 * public online catalogue never asks.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';
import { shouldRemindToLock } from '@/lib/catalogue-lock-reminder';

describe('"Lock the numbers now?" when downloading a catalogue to print', () => {
  it('reminds only after entries close, and only while unlocked', () => {
    expect(shouldRemindToLock({ entriesClosed: true, locked: false })).toBe(true);
    expect(shouldRemindToLock({ entriesClosed: true, locked: true })).toBe(false);
    expect(shouldRemindToLock({ entriesClosed: false, locked: false })).toBe(false);
  });

  it("the secretary's lock state says whether entries have closed (the entry window rule) and whether numbers are locked", async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(secretary);
    const open = await makeShow({ organisationId: org.id, status: 'entries_open', entryCloseDate: new Date('2030-05-01T22:59:00Z') });
    const closedByDate = await makeShow({ organisationId: org.id, status: 'entries_open', entryCloseDate: new Date('2020-05-01T22:59:00Z') });
    const locked = await makeShow({ organisationId: org.id, status: 'entries_closed', catalogueNumbersLockedAt: new Date() });
    expect(await caller.secretary.getCatalogueLockState({ showId: open.id })).toEqual({ entriesClosed: false, locked: false });
    expect(await caller.secretary.getCatalogueLockState({ showId: closedByDate.id })).toEqual({ entriesClosed: true, locked: false });
    expect(await caller.secretary.getCatalogueLockState({ showId: locked.id })).toEqual({ entriesClosed: true, locked: true });
  });

  it('the print catalogues ask; the public online catalogue never does', () => {
    const read = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');
    const docs = read('app', '(secretary)', 'secretary', 'shows', '[id]', 'documents', 'page.tsx');
    for (const format of ['by-class', 'standard', 'judging']) {
      expect(docs, format).toMatch(new RegExp(`format="${format}" lockReminder`));
    }
    expect(read('app', '(shows)', 'shows', '[id]', 'catalogue', 'page.tsx')).not.toMatch(/lockReminder/);
    expect(read('components', 'catalogue', 'catalogue-job-button.tsx')).toMatch(/shouldRemindToLock\(/);
  });
});
