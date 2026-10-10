import { describe, it, expect } from 'vitest';
import { buildJudgingSections } from '../catalogue-judging';
import type { ClassGroup } from '../catalogue-utils';

// Mandy, South Western, 2026-07-28 (Telegram): "The stewards book should also
// mirror the catalogue order — can you change that as well." The Standard
// Catalogue (catalogue-ringside.tsx) has always given Special Award Classes
// their own section, between Bitch and Junior Handling. The steward book's
// buildJudgingSections had no bucket for them at all — sex=null and not a
// Junior Handling class fell through the catch-all straight into "Dogs", with
// no section heading and no judge line, silently appended after Veteran Dog.
//
// This reproduces the real South Western show's shape (27 classes, read via
// mcp__render__query_render_postgres against prod, show
// dbefb92e-48a5-4800-9fe8-d34da550de7a): 11 numbered Dog breed classes,
// 11 numbered Bitch breed classes, 2 NUMBERED Junior Handling classes
// (sex=null — numbering isn't what distinguishes JH from Special Award
// Classes, the class name is), then 3 UNNUMBERED Special Award Classes
// (Junior / PG / Open, sex=null).

const cls = (over: Partial<ClassGroup> & Pick<ClassGroup, 'className'>): ClassGroup => ({
  classNumber: null,
  classLabel: undefined,
  sex: null,
  sortOrder: 0,
  entries: [],
  ...over,
});

const AGE_NAMES = [
  'Baby Puppy', 'Minor Puppy', 'Puppy', 'Junior', 'Yearling',
  'Special Long Coat Yearling', 'Post Graduate', 'Limit', 'Open',
  'Special Long Coat Open', 'Veteran',
];

function southWesternShape(): ClassGroup[] {
  const classes: ClassGroup[] = [];
  let n = 1;
  for (const sex of ['dog', 'bitch'] as const) {
    for (const name of AGE_NAMES) {
      classes.push(cls({ className: name, sex, classNumber: n, sortOrder: n - 1 }));
      n++;
    }
  }
  // JH classes: numbered (23, 24), sex=null — schedule position BEFORE the
  // Special Award Classes, same as the real show. classDefinitionType drives
  // the real `isJuniorHandler` predicate now, not a name regex.
  classes.push(cls({ className: 'JHA Handling (6-11)', classLabel: 'JHA', sex: null, classNumber: n, sortOrder: n - 1, classDefinitionType: 'junior_handler' }));
  n++;
  classes.push(cls({ className: 'JHA Handling (12-16)', classLabel: 'JHB', sex: null, classNumber: n, sortOrder: n - 1, classDefinitionType: 'junior_handler' }));
  n++;
  // Special Award Classes: unnumbered, sex=null, labelled A/B/C.
  // classDefinitionType drives the real `isSpecialAwardClass` predicate now.
  const sacNames = ['Special Award Class - Junior', 'Special Award Class - Post Graduate', 'Special Award Class - Open'];
  const sacLabels = ['A', 'B', 'C'];
  sacNames.forEach((name, i) => {
    classes.push(cls({ className: name, classLabel: sacLabels[i], sex: null, classNumber: null, sortOrder: n - 1 + i, classDefinitionType: 'special' }));
  });
  return classes;
}

describe('steward book — Special Award Classes get their own section', () => {
  it('produces exactly Dog, Bitch, Special Awards, Junior Handling — in that order', () => {
    const sections = buildJudgingSections(southWesternShape());
    expect(sections.map((s) => s.key)).toEqual(['dog', 'bitch', 'special', 'jh']);
    expect(sections.map((s) => s.label)).toEqual([
      'Dogs', 'Bitches', 'Special Awards Classes', 'Junior Handling',
    ]);
  });

  it('puts all 11 breed classes (and only those) in Dogs — no Special Award Classes mixed in', () => {
    const sections = buildJudgingSections(southWesternShape());
    const dogs = sections.find((s) => s.key === 'dog')!;
    expect(dogs.classes).toHaveLength(11);
    expect(dogs.classes.map((c) => c.className)).toEqual(AGE_NAMES);
    expect(dogs.classes.some((c) => c.className.startsWith('Special Award Class'))).toBe(false);
  });

  it('puts all 3 Special Award Classes in the Special Awards section, none elsewhere', () => {
    const sections = buildJudgingSections(southWesternShape());
    const special = sections.find((s) => s.key === 'special')!;
    expect(special.classes.map((c) => c.className)).toEqual([
      'Special Award Class - Junior',
      'Special Award Class - Post Graduate',
      'Special Award Class - Open',
    ]);
    const bitch = sections.find((s) => s.key === 'bitch')!;
    const jh = sections.find((s) => s.key === 'jh')!;
    expect(bitch.classes.some((c) => c.className.startsWith('Special Award Class'))).toBe(false);
    expect(jh.classes.some((c) => c.className.startsWith('Special Award Class'))).toBe(false);
  });

  it('keeps the 2 numbered JH classes in Junior Handling, not folded into Special Awards', () => {
    const sections = buildJudgingSections(southWesternShape());
    const jh = sections.find((s) => s.key === 'jh')!;
    expect(jh.classes.map((c) => c.className)).toEqual([
      'JHA Handling (6-11)', 'JHA Handling (12-16)',
    ]);
  });
});
