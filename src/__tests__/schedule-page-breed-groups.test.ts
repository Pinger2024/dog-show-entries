import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from './helpers/static-scan';
import { breedClassGroups, type BreedGroupClass } from '@/app/(shows)/shows/[id]/schedule/_lib/breed-class-groups';

// The public schedule page (/shows/<id>/schedule) split each breed's classes
// into Dog / Bitch / the rest by reading `classDefinition.sex` — a column
// class_definitions does not have (sex lives on show_classes). So `sex` was
// always undefined and every class fell into one unheaded list: Dog and Bitch
// never rendered (found by tsc, 1 Nov 2026; fixed 3 Nov). The split now comes
// from the running-order owner, sectionClasses (lib/class-labels.ts).

const GSD = { name: 'German Shepherd Dog', group: { sortOrder: 5 } };
const cls = (id: string, name: string, type: string, sex: 'dog' | 'bitch' | null, breed: BreedGroupClass['breed'] = GSD): BreedGroupClass => ({
  id,
  sex,
  classDefinition: { name, type },
  breed,
});

const SHOW: BreedGroupClass[] = [
  cls('vet', 'Veteran', 'age', null),
  cls('mpd', 'Minor Puppy', 'age', 'dog'),
  cls('od', 'Open', 'achievement', 'dog'),
  cls('mpb', 'Minor Puppy', 'age', 'bitch'),
  cls('ob', 'Open', 'achievement', 'bitch'),
  cls('sac', 'Special Beginners', 'special', null),
  cls('jh', 'Junior Handling (6-11)', 'junior_handler', null, null),
];

describe('public schedule page — classes by breed, split by the running-order owner', () => {
  const groups = breedClassGroups(SHOW, new Set(['sac']));
  const gsd = groups.find((g) => g.breedName === 'German Shepherd Dog')!;

  it('splits a breed into Mixed, Dog and Bitch, in the show running order', () => {
    expect(gsd.sections.map((s) => s.key)).toEqual(['mixed', 'dog', 'bitch']);
    expect(gsd.sections.map((s) => s.classes.map((c) => c.id))).toEqual([['vet'], ['mpd', 'od'], ['mpb', 'ob']]);
  });

  it('leaves Special Award classes to their own section on the page', () => {
    expect(groups.flatMap((g) => g.sections.flatMap((s) => s.classes.map((c) => c.id)))).not.toContain('sac');
  });

  it('heads Junior Handling as Junior Handling, not as a mixed class', () => {
    const anyBreed = groups.find((g) => g.breedName === 'Any Breed')!;
    expect(anyBreed.sections.map((s) => s.key)).toEqual(['jh']);
  });

  it('orders breeds by their group, then by name', () => {
    expect(groups.map((g) => g.breedName)).toEqual(['German Shepherd Dog', 'Any Breed']);
  });
});

describe('a class\'s sex lives on show_classes, never on its definition', () => {
  it('no source file reads or selects classDefinition.sex', () => {
    const offenders = findFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return /classDefinition\??\.sex\b/.test(src) || /classDefinition:\s*\{\s*columns:\s*\{[^}]*\bsex:/.test(src);
      });
    expect(offenders).toEqual([]);
  });

  it('the schedule page takes its breed sections from breedClassGroups', () => {
    const page = readFileSync(path.join('src', 'app', '(shows)', 'shows', '[id]', 'schedule', 'page.tsx'), 'utf8');
    expect(page).toMatch(/\bbreedClassGroups\(/);
    expect(page).not.toMatch(/dogClasses|bitchClasses|combinedClasses/);
  });
});
