import { describe, it, expect } from 'vitest';
import {
  resultsPublication,
  resultsFinalised,
  RESULTS_PUBLICATION_LABEL,
  RESULTS_LIVE_NOTE,
} from '../results-publication';

// Mandy, 16 Nov 2026: "I don't know why it shows on remi dashboard they
// haven't but you can see them in public domain" — Winter Spectacular had
// every class published live by its stewards, but nobody had pressed the
// show-wide Publish Results, and the dashboard said "Results not yet published".
describe('resultsPublication — none / live / final', () => {
  it('is "final" once the secretary has pressed Publish Results', () => {
    expect(resultsPublication({ resultsPublishedAt: new Date('2026-11-15T18:00:00Z'), hasPublishedResults: true })).toBe('final');
    expect(resultsPublication({ resultsPublishedAt: '2026-11-15T18:00:00Z', hasPublishedResults: false })).toBe('final');
  });

  it('is "live" when stewards have published classes but Publish Results has not been pressed', () => {
    expect(resultsPublication({ resultsPublishedAt: null, hasPublishedResults: true })).toBe('live');
  });

  it('is "none" when nothing is on the public page yet', () => {
    expect(resultsPublication({ resultsPublishedAt: null, hasPublishedResults: false })).toBe('none');
    expect(resultsPublication({ resultsPublishedAt: undefined, hasPublishedResults: false })).toBe('none');
  });

  it('resultsFinalised is the "final" test alone — live results are not finalised', () => {
    expect(resultsFinalised({ resultsPublishedAt: null })).toBe(false);
    expect(resultsFinalised({ resultsPublishedAt: new Date() })).toBe(true);
  });

  it('says each state in plain words', () => {
    expect(RESULTS_PUBLICATION_LABEL).toEqual({
      none: 'Results not yet published',
      live: 'Results showing live',
      final: 'Results published',
    });
    expect(RESULTS_LIVE_NOTE).toBe(
      'Your classes are already on the public results page. Press Publish Results to lock them and email the exhibitors.',
    );
  });
});
