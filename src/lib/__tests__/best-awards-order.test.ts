import { describe, it, expect } from 'vitest';
import { buildBestAwards } from '../best-awards';

// Mandy, South Western, 2026-07-27: "the order in which we have the best awards
// in this table should be mirrored in the catalogue but currently they are
// not", and "for this show we should have best in show instead of best of
// breed".
//
// Her configured list, in her order, straight from production:
const SOUTH_WESTERN = [
  'Best in Show',
  'Reserve Best in Show',
  'Dog Challenge Certificate',
  'Reserve Dog Challenge Certificate',
  'Bitch Challenge Certificate',
  'Reserve Bitch Challenge Certificate',
  'Best Long Coat Adult',
  'Best Puppy in Show',
  'Best Puppy Dog',
  'Best Puppy Bitch',
  'Best Long Coat Puppy',
  'Best Baby Puppy',
  'Best Veteran',
];

describe('buildBestAwards — a configured list wins verbatim', () => {
  it("prints the secretary's list in the secretary's order", () => {
    expect(buildBestAwards('championship', SOUTH_WESTERN)).toEqual(SOUTH_WESTERN);
  });

  it('never injects Best of Breed into a list that does not have it', () => {
    // The championship defaults lead with Best of Breed. Mandy's show calls
    // that award Best in Show, and printing both was the fault she reported.
    const out = buildBestAwards('championship', SOUTH_WESTERN);
    expect(out).not.toContain('Best of Breed');
    expect(out).toContain('Best in Show');
  });

  it('does not reorder awards the old canonical list did not recognise', () => {
    // Reserve Best in Show, the CCs, Long Coats and Baby Puppy were all
    // unrecognised, so they used to be dumped at the end regardless of order.
    const out = buildBestAwards('championship', SOUTH_WESTERN);
    expect(out.indexOf('Reserve Best in Show')).toBe(1);
    expect(out.indexOf('Best Veteran')).toBe(out.length - 1);
  });

  it('adds nothing at all — the list length is exactly what was configured', () => {
    expect(buildBestAwards('championship', SOUTH_WESTERN)).toHaveLength(SOUTH_WESTERN.length);
  });

  it('still falls back to show-type defaults when nothing is configured', () => {
    const out = buildBestAwards('championship', []);
    expect(out[0]).toBe('Best of Breed');
    expect(out).toContain('Dog Challenge Certificate');
  });

  it('falls back to Best in Show for an unknown show type', () => {
    expect(buildBestAwards('something-odd', [])).toEqual(['Best in Show']);
  });

  it('leaves a short custom list short — no defaults topped up behind it', () => {
    expect(buildBestAwards('championship', ['Best in Show'])).toEqual(['Best in Show']);
  });
});
