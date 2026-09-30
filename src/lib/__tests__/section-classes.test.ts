import { describe, it, expect } from 'vitest';
import { sectionClasses, type SectionableClass } from '../class-labels';

// `sectionClasses` is the ONE bucketing + ordering decision shared by the
// Standard Catalogue (catalogue-ringside.tsx), the Stewards' Catalogue
// (catalogue-judging.tsx), the public schedule's SAC filter (shows/[id]/
// schedule/page.tsx), and the printed Schedule (show-schedule.tsx). Before
// this existed, all four hand-rolled the split — one of them matched a
// `/special award/i` regex against the class NAME, which is exactly how a
// club naming a class differently could break bucketing silently.
//
// TRAP this exists to avoid: Special Award classes are `sex: null` AND
// unnumbered; Junior Handling is `sex: null` AND numbered. Neither of these
// tests bucket on numbering — only the real predicates matter.

interface TestClass extends SectionableClass {
  id: string;
}

const identity = (c: TestClass): TestClass => c;

const dog = (id: string): TestClass => ({ id, sex: 'dog' });
const bitch = (id: string): TestClass => ({ id, sex: 'bitch' });
const sac = (id: string, name = 'Special Award Class - Open'): TestClass => ({
  id,
  sex: null,
  classDefinition: { type: 'special', name },
});
const jh = (id: string): TestClass => ({
  id,
  sex: null,
  classDefinition: { type: 'junior_handler', name: 'Junior Handling' },
});
// A class for dogs AND bitches together that is neither Special Award nor
// Junior Handling — Veteran, AV classes. Its own 'mixed' section.
const mixed = (id: string): TestClass => ({ id, sex: null });

describe('sectionClasses', () => {
  it('never lands a Special Award class in Dog, even though both can be sex=null-adjacent', () => {
    const sections = sectionClasses([dog('1'), sac('2')], identity);
    const dogSection = sections.find((s) => s.key === 'dog')!;
    const specialSection = sections.find((s) => s.key === 'special')!;
    expect(dogSection.classes.map((c) => c.id)).toEqual(['1']);
    expect(specialSection.classes.map((c) => c.id)).toEqual(['2']);
  });

  it('never lands Junior Handling in Special — SAC and JH are both sex=null but distinct predicates', () => {
    const sections = sectionClasses([sac('1'), jh('2')], identity);
    const specialSection = sections.find((s) => s.key === 'special')!;
    const jhSection = sections.find((s) => s.key === 'jh')!;
    expect(specialSection.classes.map((c) => c.id)).toEqual(['1']);
    expect(jhSection.classes.map((c) => c.id)).toEqual(['2']);
  });

  it('never buckets on sex=null-ness alone — SAC, JH, and a mixed sex=null class all resolve differently', () => {
    const sections = sectionClasses([sac('1'), jh('2'), mixed('3')], identity);
    expect(sections.map((s) => s.key)).toEqual(['mixed', 'special', 'jh']);
  });

  it('lands a mixed class in its own section rather than disappearing or joining Dogs', () => {
    const sections = sectionClasses([mixed('1')], identity);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.key).toBe('mixed');
    expect(sections[0]!.classes.map((c) => c.id)).toEqual(['1']);
  });

  it('returns sections in the running order Mixed → Dog → Bitch → Special → JH', () => {
    // Deliberately passed out of order to prove the function orders the
    // OUTPUT, not just preserves input order. Mixed first: Mandy 2026-07-28,
    // and North Eastern 2026's Veteran (class 1) printing last (30 Sept).
    const sections = sectionClasses(
      [jh('jh1'), mixed('mixed1'), sac('sac1'), bitch('b1'), dog('d1')],
      identity,
    );
    expect(sections.map((s) => s.key)).toEqual(['mixed', 'dog', 'bitch', 'special', 'jh']);
  });

  it('places Special Awards before Junior Handling — the secretary confirmed this is the correct running order', () => {
    // Durable record of the domain decision: Special Award Classes run in
    // the lunch break, ahead of the Junior Handling classes. The printed
    // Schedule (show-schedule.tsx) had this backwards until the secretary
    // flagged that it disagreed with the catalogue and steward's book,
    // which have always had Special Awards first. Pin the order here so it
    // can't silently regress in any consumer of this helper.
    const sections = sectionClasses([jh('jh1'), sac('sac1')], identity);
    const specialIdx = sections.findIndex((s) => s.key === 'special');
    const jhIdx = sections.findIndex((s) => s.key === 'jh');
    expect(specialIdx).toBeGreaterThanOrEqual(0);
    expect(jhIdx).toBeGreaterThanOrEqual(0);
    expect(specialIdx).toBeLessThan(jhIdx);
  });

  it('preserves persisted order within a section', () => {
    const sections = sectionClasses(
      [dog('d3'), dog('d1'), dog('d2')],
      identity,
    );
    // Bucketing is a single stable pass — order within a section is
    // whatever order the caller passed in (the caller is responsible for
    // already being in persisted/sortOrder order).
    expect(sections.find((s) => s.key === 'dog')!.classes.map((c) => c.id)).toEqual([
      'd3', 'd1', 'd2',
    ]);
  });

  it('omits sections with no classes rather than returning an empty section', () => {
    const sections = sectionClasses([dog('1')], identity);
    expect(sections.map((s) => s.key)).toEqual(['dog']);
  });

  it('adapts flat classType/className shapes (e.g. a schedule ScheduleClass) via toClassLike', () => {
    interface FlatClass {
      id: string;
      sex: string | null;
      classType: string | null;
      className: string;
    }
    const flatSac: FlatClass = { id: '1', sex: null, classType: 'special', className: 'Special Award Class - Junior' };
    const flatJh: FlatClass = { id: '2', sex: null, classType: 'junior_handler', className: 'Junior Handling' };
    const flatDog: FlatClass = { id: '3', sex: 'dog', classType: 'breed', className: 'Open Dog' };

    const sections = sectionClasses(
      [flatSac, flatJh, flatDog],
      (c) => ({ sex: c.sex, classDefinition: { type: c.classType, name: c.className } }),
    );
    expect(sections.map((s) => s.key)).toEqual(['dog', 'special', 'jh']);
  });
});
