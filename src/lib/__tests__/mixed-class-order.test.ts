/**
 * Mandy, North Eastern Championship 2026 (30 Sept): the Veteran class — a
 * mixed class for dogs AND bitches, class 1, catalogue numbers 1–4, judged
 * first — printed at the very END of the Standard catalogue and the
 * Steward's catalogue, under "Other Classes" after every bitch class, and on
 * the last class page of the Judge's Book. The By Class catalogue and the
 * Schedule had it first.
 *
 * Cause: the running order was written in four places. `sectionClasses`
 * called a mixed class an unrecognised-shape "other" and put it last; the
 * Standard catalogue and the Judge's Book each kept their own order list
 * with "other" last; only the Schedule knew mixed classes go at the top.
 * Mandy's order (asked directly, 2026-07-28) is Mixed → Dog → Bitch →
 * Special Awards → Junior Handling, and it now lives in ONE place:
 * `sectionClasses` returns the sections in that order and every document
 * lays them out in the order it is given.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { sectionClasses, type SectionableClass } from '@/lib/class-labels';
import { buildJudgingSections, buildChallengeRegister } from '@/components/catalogue/catalogue-judging';
import { buildRingsideSections } from '@/components/catalogue/catalogue-ringside';
import { buildJudgesBookPages } from '@/lib/judges-book-pages';
import type { ClassGroup } from '@/components/catalogue/catalogue-utils';
import type { JudgesBookClass } from '@/app/api/judges-book/[showId]/route';

// North Eastern's real shape, in its persisted order: Veteran (mixed, class
// 1), the two Junior Handling classes, then the dog and bitch classes.
type Shape = { name: string; sex: 'dog' | 'bitch' | null; type: string; label: string };
const NORTH_EASTERN: Shape[] = [
  { name: 'Veteran', sex: null, type: 'age', label: '1' },
  { name: 'JHA Handling (6-11)', sex: null, type: 'junior_handler', label: 'JHA' },
  { name: 'JHA Handling (12-16)', sex: null, type: 'junior_handler', label: 'JHB' },
  { name: 'Minor Puppy', sex: 'dog', type: 'age', label: '2' },
  { name: 'Open', sex: 'dog', type: 'achievement', label: '11' },
  { name: 'Minor Puppy', sex: 'bitch', type: 'age', label: '12' },
  { name: 'Open', sex: 'bitch', type: 'achievement', label: '21' },
  { name: 'Special Award Class - Open', sex: null, type: 'special', label: 'A' },
];

describe('mixed classes run first — one order, every document', () => {
  it('sectionClasses puts a mixed class (Veteran) in its own first section', () => {
    const sections = sectionClasses(
      NORTH_EASTERN.map((c): SectionableClass & { name: string } => ({
        name: c.name,
        sex: c.sex,
        classDefinition: { type: c.type, name: c.name },
      })),
      (c) => c,
    );
    expect(sections.map((s) => s.key)).toEqual(['mixed', 'dog', 'bitch', 'special', 'jh']);
    expect(sections[0]!.classes.map((c) => c.name)).toEqual(['Veteran']);
  });

  const groups: ClassGroup[] = NORTH_EASTERN.map((c, i) => ({
    className: c.name,
    classNumber: /^\d+$/.test(c.label) ? Number(c.label) : null,
    classLabel: c.label,
    classDefinitionType: c.type,
    sex: c.sex,
    sortOrder: i,
    entries: [],
  }));

  it("the Steward's catalogue opens with the Veteran class, under Mixed Classes", () => {
    const sections = buildJudgingSections(groups);
    expect(sections.map((s) => s.key)).toEqual(['mixed', 'dog', 'bitch', 'special', 'jh']);
    expect(sections[0]!.label).toBe('Mixed Classes');
    expect(sections[0]!.classes.map((c) => c.className)).toEqual(['Veteran']);
  });

  it("the Steward's Challenge list starts BOTH the Dogs and the Bitches lists with Veteran", () => {
    // Mandy, 30 Sept 2026: "yes veteran should be on there" — the best
    // veteran dog can challenge for Best Dog, the best veteran bitch for
    // Best Bitch, so the steward needs a line for each, first, in class order.
    const register = buildChallengeRegister(groups);
    expect(register.map((s) => s.key)).toEqual(['dog', 'bitch']);
    const [dogs, bitches] = register;
    expect(dogs!.rows.map((r) => `${r.classLabel} ${r.abbreviation}`)).toEqual(['1 VD', '2 MPD', '11 OD']);
    expect(bitches!.rows.map((r) => `${r.classLabel} ${r.abbreviation}`)).toEqual(['1 VB', '12 MPB', '21 OB']);
  });

  it('the Standard catalogue opens with the Veteran class, under Mixed Classes', () => {
    const sections = buildRingsideSections(groups, []);
    expect(sections.map((s) => s.key)).toEqual(['mixed', 'dog', 'bitch', 'special', 'jh']);
    expect(sections[0]!.label).toBe('Mixed Classes');
    expect(sections[0]!.classes.map((c) => c.className)).toEqual(['Veteran']);
  });

  it("the Judge's Book gives the Veteran class the first class page", () => {
    const book: JudgesBookClass[] = NORTH_EASTERN.map((c) => ({
      classLabel: c.label,
      className: c.name,
      sex: c.sex,
      breedName: 'German Shepherd Dog',
      judgeId: 'judge-1',
      judgeName: 'Philippe Tran Ngoc An',
      ringNumber: 1,
      isJh: c.type === 'junior_handler',
      classType: c.type,
      exhibits: [],
    }));
    const pages = buildJudgesBookPages(book, []);
    const classPages = pages.flatMap((p) => (p.kind === 'class' ? [p.class.classLabel] : []));
    expect(classPages).toEqual(['1', '2', '11', '12', '21', 'A', 'JHA', 'JHB']);
  });
});

describe('section order — one owner guard', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const grep = (pattern: string) => {
    try {
      return execFileSync('git', ['grep', '-n', '-E', pattern, '--', 'src', ':!src/**/__tests__/**'], { cwd: ROOT })
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  it('no document keeps its own list of section keys in order', () => {
    // The order is sectionClasses' return order. A second list — like the
    // Judge's Book's old SECTION_ORDER — is how Veteran ended up last.
    expect(grep(`\\[\\s*'(mixed|other|dog)',\\s*'(dog|bitch)',`).filter((l) => !l.startsWith('src/lib/class-labels.ts:'))).toEqual([]);
    expect(grep('SECTION_ORDER')).toEqual([]);
    // …nor pushes its sections one by one in an order of its own (the
    // Standard catalogue's old if/push list, which put the mixed class last).
    expect(grep(`sections\\.push\\(\\{ key: '`)).toEqual([]);
  });

  it('nothing still calls a mixed class "other"', () => {
    expect(grep(`key: 'other'|classesFor\\('other'\\)|\\.key === 'other'`)).toEqual([]);
  });
});
