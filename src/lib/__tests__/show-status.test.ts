import { describe, it, expect } from 'vitest';
import { effectiveShowStatus } from '../show-status';

const PAST = new Date(Date.now() - 60_000).toISOString();
const FUTURE = new Date(Date.now() + 60_000).toISOString();

describe('effectiveShowStatus', () => {
  it('entries_open + close date passed → entries_closed', () => {
    expect(effectiveShowStatus('entries_open', PAST)).toBe('entries_closed');
  });

  it('entries_open + close date still in future → entries_open', () => {
    expect(effectiveShowStatus('entries_open', FUTURE)).toBe('entries_open');
  });

  it('entries_open + no close date → entries_open (nothing to derive)', () => {
    expect(effectiveShowStatus('entries_open', null)).toBe('entries_open');
    expect(effectiveShowStatus('entries_open', undefined)).toBe('entries_open');
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(effectiveShowStatus('entries_open', new Date(Date.now() - 60_000))).toBe('entries_closed');
  });

  it('only touches entries_open — other statuses pass through untouched', () => {
    expect(effectiveShowStatus('draft', PAST)).toBe('draft');
    expect(effectiveShowStatus('entries_closed', PAST)).toBe('entries_closed');
    expect(effectiveShowStatus('in_progress', PAST)).toBe('in_progress');
    expect(effectiveShowStatus('completed', PAST)).toBe('completed');
  });
});
