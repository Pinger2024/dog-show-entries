import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';
import { ShowSchedule, ShowScheduleMultibreed, SvShowSchedule, scheduleCoverFits } from '@/components/schedule';

// GUARD (3 Nov 2026): a full schedule cover spilled its last notice onto a
// near-blank second page (Mandy 8170, GSD Club of Scotland 2027). The two RKC
// covers are near-copies, so the fix is shared: both take every cover style
// from coverStyles(density) (shared/styles.ts), both can render alone
// (`coverOnly`), and the one fit check — fitCoverDensity in
// renderScheduleWithFit — is what every schedule render goes through.
// Repro: integration/schedule-cover-fits.test.ts.

const SCHEDULE_DIR = path.join('src', 'components', 'schedule');
const RKC_SCHEDULES = ['show-schedule.tsx', 'show-schedule-multibreed.tsx'].map((f) => path.join(SCHEDULE_DIR, f));

describe('the schedule cover fit has one owner', () => {
  it.each(RKC_SCHEDULES)('%s takes its cover styles from coverStyles', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toMatch(/const cs = coverStyles\(coverDensity\)/);
    // A bare s.coverX would not tighten with the rest of the cover.
    expect(src).not.toMatch(/(?<![A-Za-z])s\.cover[A-Z]/);
    expect(src).toMatch(/if \(coverOnly\)/);
  });

  it('both RKC renderers have a fitted cover; the SV schedule fits its whole page count instead', () => {
    expect(scheduleCoverFits(ShowSchedule)).toBe(true);
    expect(scheduleCoverFits(ShowScheduleMultibreed)).toBe(true);
    expect(scheduleCoverFits(SvShowSchedule)).toBe(false);
  });

  it('every schedule render in the app goes through renderScheduleWithFit', () => {
    const renderers = findFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => /pickScheduleComponent\(/.test(readFileSync(f, 'utf8')))
      .filter((f) => !f.endsWith(path.join('components', 'schedule', 'index.ts')));
    expect(renderers.length).toBeGreaterThan(0);
    for (const f of renderers) expect(readFileSync(f, 'utf8'), f).toMatch(/renderScheduleWithFit\(/);
  });
});
