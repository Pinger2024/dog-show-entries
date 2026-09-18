import { describe, it, expect } from 'vitest';
import { buildPrizeCardPages, type PrizeCardClassInput } from '@/lib/prize-card-pages';
import { sectionClasses } from '@/lib/class-labels';

describe('buildPrizeCardPages', () => {
  it('returns no pages for no classes', () => {
    expect(buildPrizeCardPages([])).toEqual([]);
  });

  it('a class with zero confirmed entries contributes nothing', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 0, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Minor Puppy', sex: 'dog' },
    ];
    expect(buildPrizeCardPages(classes)).toEqual([]);
  });

  it('a class with 3 confirmed entries makes 1st/2nd/3rd cards but no Reserve, each carrying the class label + sex suffix', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 3, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Minor Puppy', sex: 'dog' },
    ];
    const pages = buildPrizeCardPages(classes);
    expect(pages.map((p) => p.placement)).toEqual([1, 2, 3]);
    expect(pages.every((p) => p.judgeLine === 'Judge: Hugh De Zutter')).toBe(true);
    expect(pages.every((p) => p.classLine === 'Class 1 — Minor Puppy Dog')).toBe(true);
  });

  it('caps at Reserve (4) — a class with 9 confirmed entries still only makes 4 cards', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 9, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Minor Puppy', sex: 'dog' },
    ];
    const pages = buildPrizeCardPages(classes);
    expect(pages.map((p) => p.placement)).toEqual([1, 2, 3, 4]);
  });

  it('formats the judge line with affix when present, without when absent', () => {
    const withAffix = buildPrizeCardPages([
      { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter', judgeAffix: 'Ch.', classLabel: 'Class 1 — Minor Puppy', sex: 'dog' },
    ]);
    expect(withAffix[0].judgeLine).toBe('Judge: Hugh De Zutter (Ch.)');

    const noAffix = buildPrizeCardPages([
      { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Minor Puppy', sex: 'dog' },
    ]);
    expect(noAffix[0].judgeLine).toBe('Judge: Hugh De Zutter');
  });

  // Mandy 2026-08-17: "if no JH judge assigned, can we just have a
  // Judge: _________ instead so that it can be hand written in" — a card
  // must never print judge-less; the blank invites the pen.
  it('a class with no assigned judge gets a hand-writable blank judge line rather than none', () => {
    const pages = buildPrizeCardPages([
      { confirmedCount: 2, judgeId: null, judgeName: null, classLabel: 'Class 1 — Minor Puppy', sex: 'dog' },
    ]);
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => p.judgeLine === 'Judge: ______________________')).toBe(true);
    expect(pages.every((p) => p.classLine === 'Class 1 — Minor Puppy Dog')).toBe(true);
  });

  // Mandy, South Western, 2026-07-30: "you need the sex on them ie minor
  // puppy dog, minor puppy bitch" — class definitions are sex-neutral
  // ("Minor Puppy"); sex lives on the show_class row (PrizeCardClassInput.sex)
  // and gets appended by buildPrizeCardPages itself.
  describe('sex suffix on the class line', () => {
    it('appends "Dog" for a dog class', () => {
      const pages = buildPrizeCardPages([
        { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Minor Puppy', sex: 'dog' },
      ]);
      expect(pages[0].classLine).toBe('Class 1 — Minor Puppy Dog');
    });

    it('appends "Bitch" for a bitch class', () => {
      const pages = buildPrizeCardPages([
        { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 14 — Puppy', sex: 'bitch' },
      ]);
      expect(pages[0].classLine).toBe('Class 14 — Puppy Bitch');
    });

    it('appends nothing for a sexless class (Special Award / Junior Handling) — the class name stands alone', () => {
      const sacPages = buildPrizeCardPages([
        { confirmedCount: 1, judgeId: 'j1', judgeName: 'Ms K Salamon', classLabel: 'Class A — Special Award Class - Open', sex: null },
      ]);
      expect(sacPages[0].classLine).toBe('Class A — Special Award Class - Open');

      const jhPages = buildPrizeCardPages([
        { confirmedCount: 1, judgeId: 'j2', judgeName: 'Mandy McAteer', classLabel: 'Class JHA — Junior Handling (6-11)', sex: null },
      ]);
      expect(jhPages[0].classLine).toBe('Class JHA — Junior Handling (6-11)');
    });

    it('appends nothing when sex is omitted entirely (optional field)', () => {
      const pages = buildPrizeCardPages([
        { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Veteran' },
      ]);
      expect(pages[0].classLine).toBe('Class 1 — Veteran');
    });
  });

  // Mandy's correction, 2026-07-30: page order is CLASS-MAJOR, not
  // placement-major — "MPD 1st, 2nd followed by puppy dog 1st 2nd, 3rd,
  // junior dog, 1st etc". The pinned example from her spec: classes with
  // [2, 3, 0] confirmed entries → [C1-1st, C1-2nd, C2-1st, C2-2nd, C2-3rd].
  // `classesInRunningOrder` is a positional array, so C1/C2/C3 below ARE
  // the running order — the caller (route.ts) is responsible for sorting.
  it('orders pages CLASS-MAJOR: each class\'s own placements in sequence, in running order, each carrying its own class label', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 2, judgeId: 'j1', judgeName: 'Class One Judge', classLabel: 'Class 1 — Minor Puppy', sex: 'dog' }, // C1
      { confirmedCount: 3, judgeId: 'j2', judgeName: 'Class Two Judge', classLabel: 'Class 2 — Puppy', sex: 'dog' }, // C2
      { confirmedCount: 0, judgeId: 'j3', judgeName: 'Class Three Judge', classLabel: 'Class 3 — Junior', sex: 'dog' }, // C3 — contributes nothing
    ];
    const pages = buildPrizeCardPages(classes);
    expect(pages.map((p) => p.placement)).toEqual([1, 2, 1, 2, 3]);
    expect(pages.map((p) => p.judgeLine)).toEqual([
      'Judge: Class One Judge',
      'Judge: Class One Judge',
      'Judge: Class Two Judge',
      'Judge: Class Two Judge',
      'Judge: Class Two Judge',
    ]);
    expect(pages.map((p) => p.classLine)).toEqual([
      'Class 1 — Minor Puppy Dog',
      'Class 1 — Minor Puppy Dog',
      'Class 2 — Puppy Dog',
      'Class 2 — Puppy Dog',
      'Class 2 — Puppy Dog',
    ]);
  });

  it('does NOT aggregate two classes that share the same judge — each class keeps its own contiguous block, with its own label', () => {
    // Same judge on a dog class then a bitch class: class-major order means
    // the dog class's cards finish completely before the bitch class starts,
    // even though a placement-major scheme would have interleaved them.
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 2, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Yearling', sex: 'dog' }, // dog class: 1st, 2nd
      { confirmedCount: 1, judgeId: 'j1', judgeName: 'Hugh De Zutter', classLabel: 'Class 2 — Yearling', sex: 'bitch' }, // bitch class: 1st only
    ];
    const pages = buildPrizeCardPages(classes);
    expect(pages.map((p) => p.placement)).toEqual([1, 2, 1]);
    expect(pages.map((p) => p.classLine)).toEqual([
      'Class 1 — Yearling Dog',
      'Class 1 — Yearling Dog',
      'Class 2 — Yearling Bitch',
    ]);
    expect(pages).toHaveLength(3);
  });

  it('SAC and JH classes attribute their cards to their OWN judge and carry their own (sexless) class label, in running order', () => {
    // Same shape as the real trap: a single-breed show where the breed judge,
    // the SAC judge and the JH judge are three different people, and each
    // class must carry its own resolved judge (resolveJudgeForClass's job,
    // upstream of this function) rather than falling back to the breed judge.
    // Running order here mirrors the standing Dog → Special Awards → JH
    // section order (sectionClasses) that route.ts is responsible for.
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 2, judgeId: 'breed-judge', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Yearling', sex: 'dog' }, // breed class
      { confirmedCount: 2, judgeId: 'sac-judge', judgeName: 'Ms K Salamon', classLabel: 'Class A — Special Award Class - Open', sex: null }, // Special Award Class
      { confirmedCount: 2, judgeId: 'jh-judge', judgeName: 'Mandy McAteer', classLabel: 'Class JHA — Junior Handling', sex: null }, // Junior Handling
    ];
    const pages = buildPrizeCardPages(classes);
    expect(pages.map((p) => p.judgeLine)).toEqual([
      'Judge: Hugh De Zutter',
      'Judge: Hugh De Zutter',
      'Judge: Ms K Salamon',
      'Judge: Ms K Salamon',
      'Judge: Mandy McAteer',
      'Judge: Mandy McAteer',
    ]);
    expect(pages.map((p) => p.classLine)).toEqual([
      'Class 1 — Yearling Dog',
      'Class 1 — Yearling Dog',
      'Class A — Special Award Class - Open',
      'Class A — Special Award Class - Open',
      'Class JHA — Junior Handling',
      'Class JHA — Junior Handling',
    ]);
  });

  it('the total page count matches Σ min(confirmedCount, 4) across all classes', () => {
    const classes: PrizeCardClassInput[] = [
      { confirmedCount: 0, judgeId: 'j1', judgeName: 'A', classLabel: 'Class 1' },
      { confirmedCount: 1, judgeId: 'j2', judgeName: 'B', classLabel: 'Class 2' },
      { confirmedCount: 2, judgeId: 'j3', judgeName: 'C', classLabel: 'Class 3' },
      { confirmedCount: 5, judgeId: 'j4', judgeName: 'D', classLabel: 'Class 4' },
      { confirmedCount: 9, judgeId: 'j5', judgeName: 'E', classLabel: 'Class 5' },
    ];
    // 0 + 1 + 2 + 4 + 4 = 11 — same arithmetic as computePrizeCardCounts.
    expect(buildPrizeCardPages(classes)).toHaveLength(11);
  });
});

// route.ts's actual pipeline: query show_classes in sortOrder/classNumber
// order, rebucket Dog → Bitch → Special Awards → Junior Handling via the
// SHARED sectionClasses helper (never a locally-invented order), then feed
// the flattened result into buildPrizeCardPages. This proves that
// composition end-to-end at the pure-function level — no DB, no PDF
// render — since pdf-lib (used by the real-render integration test) can't
// read text back out of a rendered PDF to check page-by-page ordering
// there; the exact sequence is pinned here instead.
describe('buildPrizeCardPages composed with sectionClasses (route.ts\'s pipeline)', () => {
  type FakeShowClass = {
    id: string;
    sex: 'dog' | 'bitch' | null;
    classDefinition: { type: string; name: string };
    confirmedCount: number;
    judgeId: string;
    judgeName: string;
    classLabel: string;
  };

  it('reorders a DB-scrambled class list into Dog → Bitch → Special Awards → Junior Handling running order, with sex suffixes applied', () => {
    // Deliberately scrambled — JH first, then bitch, then SAC, then dog —
    // to prove the bucketing does the reordering, not insertion order.
    const rawClasses: FakeShowClass[] = [
      { id: 'jh', sex: null, classDefinition: { type: 'junior_handler', name: 'Junior Handling' }, confirmedCount: 1, judgeId: 'jh-judge', judgeName: 'Mandy McAteer', classLabel: 'Class JHA — Junior Handling' },
      { id: 'bitch', sex: 'bitch', classDefinition: { type: 'age', name: 'Yearling Bitch' }, confirmedCount: 1, judgeId: 'breed-judge', judgeName: 'Hugh De Zutter', classLabel: 'Class 2 — Yearling' },
      { id: 'sac', sex: null, classDefinition: { type: 'special', name: 'Special Award Class - Open' }, confirmedCount: 1, judgeId: 'sac-judge', judgeName: 'Ms K Salamon', classLabel: 'Class A — Special Award Class - Open' },
      { id: 'dog', sex: 'dog', classDefinition: { type: 'age', name: 'Yearling Dog' }, confirmedCount: 1, judgeId: 'breed-judge', judgeName: 'Hugh De Zutter', classLabel: 'Class 1 — Yearling' },
    ];

    const runningOrder = sectionClasses(rawClasses, (c) => c).flatMap((section) => section.classes);
    expect(runningOrder.map((c) => c.id)).toEqual(['dog', 'bitch', 'sac', 'jh']);

    const pages = buildPrizeCardPages(
      runningOrder.map((c) => ({
        confirmedCount: c.confirmedCount,
        judgeId: c.judgeId,
        judgeName: c.judgeName,
        classLabel: c.classLabel,
        sex: c.sex,
      })),
    );
    // One 1st-place card per class, in Dog → Bitch → Special → JH order.
    expect(pages.map((p) => p.judgeLine)).toEqual([
      'Judge: Hugh De Zutter', // dog
      'Judge: Hugh De Zutter', // bitch
      'Judge: Ms K Salamon', // SAC
      'Judge: Mandy McAteer', // JH
    ]);
    expect(pages.map((p) => p.classLine)).toEqual([
      'Class 1 — Yearling Dog',
      'Class 2 — Yearling Bitch',
      'Class A — Special Award Class - Open', // sexless — no suffix
      'Class JHA — Junior Handling', // sexless — no suffix
    ]);
  });
});
