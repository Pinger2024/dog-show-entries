import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';

// GUARD (3 Nov 2026): Winter Spectacular's catalogue printed its Junior
// Handling judge first, as the breed judge, and without affixes, while the
// schedule got all three right — because "which judges, in what order, named
// how" was written in several places (Mandy 8184/8185). lib/schedule-judges.ts
// owns it: judgeDisplayName (Name (Affix) (subject to RKC approval)), the
// Junior Handling rule and the running order. The catalogue renders from its
// structured judgeList rather than splitting labels (a label's name part
// carries the affix, so it never matched the bio key).
// Repro: integration/catalogue-judges-and-awards.test.ts.

// The two SCHEDULE paths still carry their own copy — moving them onto the
// owner is stage (b) of this job, with a printed-schedule diff for Michael.
// Remove each from this list as it moves. A NEW copy anywhere fails.
const KNOWN_COPIES_TO_REMOVE = [
  path.join('src', 'app', 'api', 'schedule', '[showId]', 'route.ts'),
  path.join('src', 'server', 'services', 'pdf-generation.ts'),
];
const OWNER = path.join('src', 'lib', 'schedule-judges.ts');

/** Source with // and /* *\/ comments removed, so prose about the rule is fine. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('judge naming has one owner', () => {
  it('only the owner (and the two known schedule copies) builds the "(subject to RKC approval)" suffix', () => {
    const builders = findFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => /\(subject to RKC approval\)/.test(codeOnly(readFileSync(f, 'utf8'))))
      .map((f) => path.relative(process.cwd(), f));
    expect(builders.filter((f) => f !== OWNER && !KNOWN_COPIES_TO_REMOVE.includes(f))).toEqual([]);
  });

  it('the catalogue builds its judges with the owner and renders the structured list', () => {
    const snapshot = readFileSync(path.join('src', 'server', 'services', 'catalogue-snapshot.ts'), 'utf8');
    expect(snapshot).toMatch(/buildScheduleJudges\(/);
    expect(snapshot).toMatch(/judgeListForCatalogue\(/);
    for (const f of ['sv-front-matter.tsx', 'catalogue-front-matter.tsx']) {
      expect(readFileSync(path.join('src', 'components', 'catalogue', f), 'utf8'), f).toMatch(/show\.judgeList/);
    }
  });

  it('the regional schedule and catalogue print the same awards text', () => {
    expect(readFileSync(path.join('src', 'components', 'schedule', 'sv-show-schedule.tsx'), 'utf8')).toMatch(/regionalAwardsText\(/);
    const catalogue = readFileSync(path.join('src', 'components', 'catalogue', 'sv-front-matter.tsx'), 'utf8');
    expect(catalogue).toMatch(/regionalAwardsLines\(/);
    expect(codeOnly(catalogue)).not.toMatch(/Medals for 2nd/);
  });
});
