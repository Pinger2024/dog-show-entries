import { describe, it, expect } from 'vitest';
import { isShowLive, publicShowStatus, showResultsHref, showResultsState } from '@/lib/show-status';

/**
 * Which shows are live, and which have results to look at (Mandy, 5 Oct 2026:
 * people couldn't find the live results at the Midland Regional, because Find a
 * Show hid a running show unless you chose "In progress").
 */

const TODAY = '2026-10-04';
const show = (status: string, startDate: string, endDate: string | null = startDate, entryCloseDate: string | null = null) => ({
  status,
  startDate,
  endDate,
  entryCloseDate,
});

describe('isShowLive — a show running today', () => {
  it('is live once the cron has moved it on', () => {
    expect(isShowLive(show('in_progress', TODAY), TODAY)).toBe(true);
  });

  it('is live on its own day before the cron has caught up', () => {
    expect(isShowLive(show('entries_closed', TODAY), TODAY)).toBe(true);
  });

  it('is live when the status still says open but entries closed by date', () => {
    expect(isShowLive(show('entries_open', TODAY, TODAY, '2026-09-20T23:59:00Z'), TODAY)).toBe(true);
  });

  it('is live on every day of a two-day show', () => {
    expect(isShowLive(show('entries_closed', '2026-10-03', '2026-10-04'), TODAY)).toBe(true);
  });

  it('is not live the day before, the day after, or once completed', () => {
    expect(isShowLive(show('entries_closed', '2026-10-05'), TODAY)).toBe(false);
    expect(isShowLive(show('entries_closed', '2026-10-03'), TODAY)).toBe(false);
    expect(isShowLive(show('completed', TODAY), TODAY)).toBe(false);
  });

  it('is never live while still taking entries, or as a draft or cancelled show', () => {
    // (the close date is checked against the real clock, so it sits far ahead)
    expect(isShowLive(show('entries_open', TODAY, TODAY, '2099-01-01T12:00:00Z'), TODAY)).toBe(false);
    expect(isShowLive(show('draft', TODAY), TODAY)).toBe(false);
    expect(isShowLive(show('cancelled', TODAY), TODAY)).toBe(false);
  });
});

describe('showResultsState — what results a show offers', () => {
  it('live while running, whether or not anything is published yet', () => {
    expect(showResultsState(show('in_progress', TODAY), false, TODAY)).toBe('live');
    expect(showResultsState(show('entries_closed', TODAY), true, TODAY)).toBe('live');
  });

  it('available once held with published results', () => {
    expect(showResultsState(show('completed', '2026-09-05'), true, TODAY)).toBe('available');
  });

  it('none when nothing has been published — never a link to an empty page', () => {
    expect(showResultsState(show('completed', '2026-09-05'), false, TODAY)).toBe('none');
    expect(showResultsState(show('entries_closed', '2026-10-11'), false, TODAY)).toBe('none');
  });
});

describe('publicShowStatus — what a public label reads', () => {
  it('reads in_progress on the day of the show, before the cron', () => {
    expect(publicShowStatus(show('entries_closed', TODAY), TODAY)).toBe('in_progress');
  });

  it('otherwise reads the close-date-corrected status', () => {
    expect(publicShowStatus(show('entries_open', '2026-10-11', '2026-10-11', '2026-09-20T23:59:00Z'), TODAY)).toBe(
      'entries_closed',
    );
    expect(publicShowStatus(show('completed', '2026-09-05'), TODAY)).toBe('completed');
  });
});

describe('showResultsHref', () => {
  it('uses the slug, else the id', () => {
    expect(showResultsHref({ id: 'abc', slug: 'regional-show-2026' })).toBe('/shows/regional-show-2026/results');
    expect(showResultsHref({ id: 'abc', slug: null })).toBe('/shows/abc/results');
  });
});
