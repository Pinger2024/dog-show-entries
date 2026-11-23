import { describe, it, expect } from 'vitest';
import { effectiveShowStatus, entryWindowOpen } from '../show-status';

const PAST = new Date(Date.now() - 60_000).toISOString();
const FUTURE = new Date(Date.now() + 60_000).toISOString();

describe('effectiveShowStatus', () => {
  it('entries_open + close date passed → entries_closed', () => {
    expect(effectiveShowStatus({ status: 'entries_open', entryCloseDate: PAST })).toBe(
      'entries_closed'
    );
  });

  it('entries_open + close date still in future → entries_open', () => {
    expect(effectiveShowStatus({ status: 'entries_open', entryCloseDate: FUTURE })).toBe(
      'entries_open'
    );
  });

  it('entries_open + no close date → entries_open (nothing to derive)', () => {
    expect(effectiveShowStatus({ status: 'entries_open', entryCloseDate: null })).toBe(
      'entries_open'
    );
    expect(effectiveShowStatus({ status: 'entries_open', entryCloseDate: undefined })).toBe(
      'entries_open'
    );
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(
      effectiveShowStatus({ status: 'entries_open', entryCloseDate: new Date(Date.now() - 60_000) })
    ).toBe('entries_closed');
  });

  it('only touches entries_open — other statuses pass through untouched', () => {
    expect(effectiveShowStatus({ status: 'draft', entryCloseDate: PAST })).toBe('draft');
    expect(effectiveShowStatus({ status: 'entries_closed', entryCloseDate: PAST })).toBe(
      'entries_closed'
    );
    expect(effectiveShowStatus({ status: 'in_progress', entryCloseDate: PAST })).toBe(
      'in_progress'
    );
    expect(effectiveShowStatus({ status: 'completed', entryCloseDate: PAST })).toBe('completed');
  });

  it('boundary: exactly at the close instant is still entries_open — matches shows-list and checkout, which both use strict "<"', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    expect(
      effectiveShowStatus({ status: 'entries_open', entryCloseDate: now.toISOString() }, now)
    ).toBe('entries_open');
    expect(
      effectiveShowStatus(
        { status: 'entries_open', entryCloseDate: new Date(now.getTime() - 1).toISOString() },
        now
      )
    ).toBe('entries_closed');
  });
});

describe('entryWindowOpen', () => {
  it('entries_open + no close date → open', () => {
    expect(entryWindowOpen({ status: 'entries_open', entryCloseDate: null })).toBe(true);
  });

  it('entries_open + close date in the future → open', () => {
    expect(entryWindowOpen({ status: 'entries_open', entryCloseDate: FUTURE })).toBe(true);
  });

  it('entries_open + close date passed → CLOSED, even though status is still entries_open', () => {
    // This is the gap the class-change top-up path had: it only checked
    // `status !== 'entries_open'` and never looked at entryCloseDate at all,
    // so a stale status (daily cron hasn't run yet) let a top-up through
    // after the real deadline.
    expect(entryWindowOpen({ status: 'entries_open', entryCloseDate: PAST })).toBe(false);
  });

  it('any other status → closed regardless of close date', () => {
    expect(entryWindowOpen({ status: 'entries_closed', entryCloseDate: FUTURE })).toBe(false);
    expect(entryWindowOpen({ status: 'draft', entryCloseDate: null })).toBe(false);
    expect(entryWindowOpen({ status: 'in_progress', entryCloseDate: null })).toBe(false);
  });

  it('boundary: exactly at the close instant is still open (strict "<", matches effectiveShowStatus)', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    expect(
      entryWindowOpen({ status: 'entries_open', entryCloseDate: now.toISOString() }, now)
    ).toBe(true);
    expect(
      entryWindowOpen(
        { status: 'entries_open', entryCloseDate: new Date(now.getTime() - 1).toISOString() },
        now,
      )
    ).toBe(false);
  });
});
