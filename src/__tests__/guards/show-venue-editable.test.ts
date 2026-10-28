import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Mandy, 28 Oct 2026 (GSD Club of Scotland draft show): getPhaseBlockers says
// "Venue not confirmed - Confirm the show venue" with actionPath '' (the main
// show page), but that page is the setup wizard and the wizard had no venue
// control at all. The new-show wizard's step 2 was the only venue picker, and
// it lets the venue be skipped. A show created without one could never get one.
//
// FALLBACK GUARD: the repo has no jsdom / @testing-library and vitest runs in
// the node environment, and the Details step is only reached after an effect
// that server rendering never runs, so SetupWizard cannot be mounted here.
// So: the wizard must wire up a venue control, either by calling
// secretary.listVenues itself or by using a shared VenuePicker component.

const WIZARD = path.join(
  __dirname,
  '..', '..',
  'app/(secretary)/secretary/shows/[id]/_components/setup-wizard.tsx',
);

describe('a draft show can have its venue set after creation', () => {
  it('the setup wizard has a venue control (listVenues or a shared VenuePicker)', () => {
    const src = readFileSync(WIZARD, 'utf8');
    expect(
      /\blistVenues\b|\bVenuePicker\b/.test(src),
      'setup-wizard.tsx has no venue control. getPhaseBlockers sends the secretary there to "Confirm the show venue"; it must be able to pick or add one.',
    ).toBe(true);
  });

  it('and it saves the choice through shows.update venueId', () => {
    const src = readFileSync(WIZARD, 'utf8');
    expect(src, 'the wizard must save venueId via shows.update').toMatch(/venueId/);
  });
});
