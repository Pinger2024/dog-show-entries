import { describe, it, expect } from 'vitest';
import { documentRowVisible } from '@/app/(secretary)/secretary/shows/[id]/_lib/document-eligibility';

// RKC-only rows hidden entirely on SV/WUSV shows — the secretary's rule:
// regionals only offer SV documents (the "By Class" catalogue, schedule, and their own SV Graded Results report). See documents-not-
// phase-gated.test.ts for the companion rule this must never violate:
// nothing here may depend on show phase/status.

const RKC_ONLY_KEYS = [
  'ring-numbers',
  'catalogue-standard',
  'catalogue-steward',
  'judges-book',
  'ring-board',
  'award-board',
  'prize-cards',
  'marked-catalogue',
] as const;

const ALWAYS_VISIBLE_KEYS = ['catalogue-by-class', 'schedule'] as const;

describe('documentRowVisible', () => {
  it('hides all 8 RKC-only rows on a wusv show', () => {
    for (const key of RKC_ONLY_KEYS) {
      expect(documentRowVisible(key, { showRuleset: 'wusv', showType: 'open' }), key).toBe(false);
    }
  });

  it('keeps by-class catalogue and schedule visible on a wusv show', () => {
    for (const key of ALWAYS_VISIBLE_KEYS) {
      expect(documentRowVisible(key, { showRuleset: 'wusv', showType: 'open' }), key).toBe(true);
    }
  });

  it('shows SV Graded Results only on a wusv show', () => {
    expect(documentRowVisible('sv-results', { showRuleset: 'wusv', showType: 'open' })).toBe(true);
    expect(documentRowVisible('sv-results', { showRuleset: 'rkc', showType: 'championship' })).toBe(false);
  });

  it('shows all 8 RKC-only rows on an rkc show', () => {
    for (const key of RKC_ONLY_KEYS) {
      expect(documentRowVisible(key, { showRuleset: 'rkc', showType: 'open' }), key).toBe(true);
    }
  });

  it('shows SH01 only for an rkc championship show', () => {
    expect(documentRowVisible('sh01', { showRuleset: 'rkc', showType: 'championship' })).toBe(true);
    expect(documentRowVisible('sh01', { showRuleset: 'rkc', showType: 'open' })).toBe(false);
    expect(documentRowVisible('sh01', { showRuleset: 'wusv', showType: 'championship' })).toBe(false);
  });
});
