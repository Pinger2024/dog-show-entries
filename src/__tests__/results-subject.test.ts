/**
 * Bug-hunt #24/#25: the results-email subject always named entries[0]'s dog,
 * even when a different dog won the award or took the best placement.
 */
import { describe, it, expect } from 'vitest';
import { buildResultsSubject } from '@/lib/results-subject';

describe('buildResultsSubject', () => {
  it('names the dog that won the award, not entries[0]', () => {
    const entries = [
      { dogId: 'd1', dog: { registeredName: 'First Dog' }, entryClasses: [] },
      { dogId: 'd2', dog: { registeredName: 'Winner Dog' }, entryClasses: [] },
    ];
    const subject = buildResultsSubject(entries, [{ dogId: 'd2', type: 'best_in_show' }], 'Spring Show');
    expect(subject).toContain('Winner Dog');
    expect(subject).not.toContain('First Dog');
  });

  it('names the dog with the best placement, not entries[0]', () => {
    const entries = [
      { dogId: 'd1', dog: { registeredName: 'First Dog' }, entryClasses: [{ result: { placement: 4 } }] },
      { dogId: 'd2', dog: { registeredName: 'Best Placed' }, entryClasses: [{ result: { placement: 1 } }] },
    ];
    const subject = buildResultsSubject(entries, [], 'Spring Show');
    expect(subject).toContain('Best Placed');
    expect(subject).not.toContain('First Dog');
  });

  it('falls back to a generic subject with no awards or top-3 placements', () => {
    const entries = [
      { dogId: 'd1', dog: { registeredName: 'Dog' }, entryClasses: [{ result: { placement: 5 } }] },
    ];
    expect(buildResultsSubject(entries, [], 'Spring Show')).toBe('Your Results — Spring Show');
  });
});
