import { describe, it, expect } from 'vitest';
import { isLiveEntry } from '../entry-counts';

describe('isLiveEntry', () => {
  it('confirmed and not deleted → true', () => {
    expect(isLiveEntry({ status: 'confirmed', deletedAt: null })).toBe(true);
  });

  it('every other status → false', () => {
    const otherStatuses = ['pending', 'withdrawn', 'cancelled', 'transferred', ''];
    for (const status of otherStatuses) {
      expect(isLiveEntry({ status, deletedAt: null })).toBe(false);
    }
  });

  it('confirmed but soft-deleted → false', () => {
    expect(isLiveEntry({ status: 'confirmed', deletedAt: new Date() })).toBe(false);
  });

  it('confirmed but soft-deleted (string date) → false', () => {
    expect(isLiveEntry({ status: 'confirmed', deletedAt: '2026-09-18T10:00:00.000Z' })).toBe(
      false
    );
  });

  it('null or undefined entry → false', () => {
    expect(isLiveEntry(null)).toBe(false);
    expect(isLiveEntry(undefined)).toBe(false);
  });

  it('confirmed with deletedAt undefined → true', () => {
    expect(isLiveEntry({ status: 'confirmed', deletedAt: undefined })).toBe(true);
  });
});
