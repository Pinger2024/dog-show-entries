import { describe, it, expect } from 'vitest';
import { buildJudgesBookPages, type JudgesBookPage } from '../judges-book-pages';
import type { JudgesBookClass } from '@/app/api/judges-book/[showId]/route';

// Mandy 2026-08-10, REVISED 2026-08-18 (having now seen the rendered pages):
// "I wouldnt edit the back awards page, just leave that with all the awards
// on it as it is today, just need that extra page for the Male awards which
// from the first image you sent and the last image looks fine." So the
// three-way split is now a TWO-way split:
//   - a Dog Awards page, dog-side awards only, right after the last dog
//     class (kept, unchanged from the 08-10 build) — this is the "extra
//     page for the Male awards" she confirmed looks fine.
//   - NO separate Bitch Awards page — removed entirely.
//   - the back page reverts to the pre-split content: the FULL configured
//     awards list, unfiltered, in the secretary's configured order. The
//     dog-side awards deliberately appear on BOTH the mid-book page and the
//     back page — that duplication is her explicit choice, not a bug.
//
// buildJudgesBookPages does NOT bucket via `!isJh` or trust the classes'
// input order — it re-buckets Dog → Bitch → Special → JH → catch-all via
// the shared `sectionClasses` helper, so these tests also stand in for the
// route's known hazard: raw show_classes.sortOrder can interleave Special
// Award / Junior Handling classes between the dog and bitch blocks.

const cls = (over: Partial<JudgesBookClass>): JudgesBookClass => ({
  classLabel: '1',
  className: 'Yearling',
  sex: 'dog',
  breedName: 'German Shepherd Dog',
  judgeId: 'judge-1',
  judgeName: 'Hugh De Zutter',
  ringNumber: 1,
  isJh: false,
  classType: 'age',
  exhibits: [],
  ...over,
});

const dogClass = (label: string): JudgesBookClass =>
  cls({ classLabel: label, sex: 'dog', classType: 'age' });
const bitchClass = (label: string): JudgesBookClass =>
  cls({ classLabel: label, sex: 'bitch', classType: 'age' });
const sacClass = (label: string): JudgesBookClass =>
  cls({
    classLabel: label,
    sex: null,
    classType: 'special',
    className: 'Special Award Class - Open',
    isJh: false,
  });
const jhClass = (label: string): JudgesBookClass =>
  cls({ classLabel: label, sex: null, classType: 'junior_handler', className: 'Junior Handling', isJh: true });

// Championship-show list (buildBestAwards's DEFAULT_BEST_AWARDS.championship).
const CHAMPIONSHIP_AWARDS = [
  'Best of Breed',
  'Dog Challenge Certificate',
  'Reserve Dog Challenge Certificate',
  'Bitch Challenge Certificate',
  'Reserve Bitch Challenge Certificate',
  'Best Puppy Dog',
  'Best Puppy Bitch',
  'Best Puppy in Show',
];

// Open-show list.
const OPEN_AWARDS = ['Best of Breed', 'Best Dog', 'Best Bitch', 'Best Puppy in Show', 'Best Veteran in Show'];

function classPageLabels(pages: JudgesBookPage[]): string[] {
  return pages.filter((p) => p.kind === 'class').map((p) => p.class.classLabel);
}

function pageKindSequence(pages: JudgesBookPage[]): string[] {
  return pages.map((p) => (p.kind === 'class' ? `class:${p.class.classLabel}` : `awards:${p.section}`));
}

describe('buildJudgesBookPages', () => {
  it('places the dog awards page immediately after the last dog class and before the first bitch class, then the full back page at the very end', () => {
    const classes = [dogClass('1'), dogClass('2'), bitchClass('3'), bitchClass('4')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual([
      'class:1',
      'class:2',
      'awards:dog',
      'class:3',
      'class:4',
      'awards:overall',
    ]);
  });

  it('does NOT render a separate bitch awards page — the bitch classes run straight through to the back of the book', () => {
    const classes = [dogClass('1'), bitchClass('2'), bitchClass('3')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pages.some((p) => p.kind === 'awards' && (p.section as string) === 'bitch')).toBe(false);
  });

  it('the back page carries the FULL configured awards list, unfiltered, in the secretary-configured order — dog-side awards deliberately duplicated from the mid-book page', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(backPage).toMatchObject({ kind: 'awards', section: 'overall', awards: CHAMPIONSHIP_AWARDS });
  });

  it('is always the very last page', () => {
    const classes = [dogClass('1'), bitchClass('2'), sacClass('A'), jhClass('JHA')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pages[pages.length - 1]).toMatchObject({ kind: 'awards', section: 'overall' });
  });

  it('a championship-show award list: the dog page gets only CCs + Best Puppy Dog, the back page gets everything, unfiltered', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(dogPage).toMatchObject({
      awards: ['Dog Challenge Certificate', 'Reserve Dog Challenge Certificate', 'Best Puppy Dog'],
    });
    expect(backPage).toMatchObject({ awards: CHAMPIONSHIP_AWARDS });
  });

  it('an open-show award list: the dog page gets only Best Dog, the back page gets everything, unfiltered', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, OPEN_AWARDS);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(dogPage).toMatchObject({ awards: ['Best Dog'] });
    expect(backPage).toMatchObject({ awards: OPEN_AWARDS });
  });

  it('never drops an unclassifiable (bespoke) award — it stays on the full back page, and is never miscategorised onto the dog page', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const bestAwards = ['Dog Challenge Certificate', 'Best of Breed', 'The Smith Memorial Trophy'];
    const pages = buildJudgesBookPages(classes, bestAwards);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(dogPage).toMatchObject({ awards: ['Dog Challenge Certificate'] });
    expect(backPage).toMatchObject({ awards: bestAwards });
  });

  it('a show with no configured Best Awards renders no awards pages at all', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, []);
    expect(pages.every((p) => p.kind === 'class')).toBe(true);
    expect(classPageLabels(pages)).toEqual(['1', '2']);
  });

  it('a Special-Award-Class-only book with no Best Awards configured gets no award pages at all', () => {
    const classes = [sacClass('A'), sacClass('B')];
    const pages = buildJudgesBookPages(classes, []);
    expect(pages.every((p) => p.kind === 'class')).toBe(true);
    expect(classPageLabels(pages)).toEqual(['A', 'B']);
  });

  it('no bitch classes on the show, but bitch-side awards are configured — they are never dropped, they simply ride along on the full back page (there is no dedicated bitch page to place them on)', () => {
    const classes = [dogClass('1'), dogClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual(['class:1', 'class:2', 'awards:dog', 'awards:overall']);
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(backPage).toMatchObject({ awards: CHAMPIONSHIP_AWARDS });
  });

  it('no dog classes, but dog-side awards are configured — the dog awards page lands before the bitch section rather than being dropped', () => {
    const classes = [bitchClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual(['awards:dog', 'class:1', 'class:2', 'awards:overall']);
  });

  it('reorders Special Award / Junior Handling classes that interleave dog and bitch in raw input order — the known route hazard', () => {
    // Raw sortOrder on some shows puts SAC/JH classes BETWEEN the dog and
    // bitch blocks. buildJudgesBookPages must re-bucket via sectionClasses,
    // not trust this input order, so the dog awards page still lands right
    // after the LAST dog class, not after whatever happens to be last in
    // the raw array.
    const classes = [dogClass('1'), dogClass('2'), sacClass('A'), jhClass('JHA'), bitchClass('3'), bitchClass('4')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual([
      'class:1',
      'class:2',
      'awards:dog',
      'class:3',
      'class:4',
      'class:A',
      'class:JHA',
      'awards:overall',
    ]);
  });

  it('preserves the secretary-configured award order on the dog page', () => {
    // Deliberately not in NAME_TO_TYPE canonical order.
    const customOrder = ['Best Puppy Dog', 'Dog Challenge Certificate', 'Reserve Dog Challenge Certificate'];
    const pages = buildJudgesBookPages([dogClass('1')], customOrder);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    expect(dogPage).toMatchObject({ awards: customOrder });
  });

  it('the back page reproduces the secretary-configured order verbatim, not reshuffled or deduped against the dog page', () => {
    const customOrder = ['Best Puppy in Show', 'Best of Breed', 'Dog Challenge Certificate'];
    const pages = buildJudgesBookPages([dogClass('1'), bitchClass('2')], customOrder);
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(backPage).toMatchObject({ awards: customOrder });
  });
});
