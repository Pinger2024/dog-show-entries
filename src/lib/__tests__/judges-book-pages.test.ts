import { describe, it, expect } from 'vitest';
import { buildJudgesBookPages, type JudgesBookPage } from '../judges-book-pages';
import type { JudgesBookClass } from '@/app/api/judges-book/[showId]/route';

// Mandy 2026-08-10, REVISED 2026-08-18 (having now seen the rendered
// pages): "I wouldnt edit the back awards page, just leave that with all
// the awards on it as it is today, just need that extra page for the Male
// awards which from the first image you sent and the last image looks
// fine." That made it a TWO-way split for a while: a Dog Awards page
// mid-book, no Bitch Awards page, and the back page as the full unfiltered
// list.
//
// REVISED AGAIN 2026-08-31, per Mandy's head steward reviewing the book at
// that weekend's shows (Clyde + Scotland): back to a THREE-way split —
//   - Dog Awards page after the last dog class (unchanged).
//   - Bitch Awards page after the last bitch class (restored, mirroring
//     the dog page exactly).
//   - the back page is now OVERALL-ONLY (Best of Breed, Best Puppy in
//     Show, Best Veteran, plus any unclassifiable bespoke trophy) — no
//     more full-list duplication of the dog/bitch pages.
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
const CHAMPIONSHIP_DOG_AWARDS = ['Dog Challenge Certificate', 'Reserve Dog Challenge Certificate', 'Best Puppy Dog'];
const CHAMPIONSHIP_BITCH_AWARDS = ['Bitch Challenge Certificate', 'Reserve Bitch Challenge Certificate', 'Best Puppy Bitch'];
const CHAMPIONSHIP_OVERALL_AWARDS = ['Best of Breed', 'Best Puppy in Show'];

// Open-show list.
const OPEN_AWARDS = ['Best of Breed', 'Best Dog', 'Best Bitch', 'Best Puppy in Show', 'Best Veteran in Show'];

function classPageLabels(pages: JudgesBookPage[]): string[] {
  return pages.filter((p) => p.kind === 'class').map((p) => p.class.classLabel);
}

function pageKindSequence(pages: JudgesBookPage[]): string[] {
  return pages.map((p) => (p.kind === 'class' ? `class:${p.class.classLabel}` : `awards:${p.section}`));
}

describe('buildJudgesBookPages', () => {
  it('places the dog awards page immediately after the last dog class, the bitch awards page immediately after the last bitch class, then the overall-only back page at the very end', () => {
    const classes = [dogClass('1'), dogClass('2'), bitchClass('3'), bitchClass('4')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual([
      'class:1',
      'class:2',
      'awards:dog',
      'class:3',
      'class:4',
      'awards:bitch',
      'awards:overall',
    ]);
  });

  it('the bitch awards page carries only the bitch-restricted awards, in configured order', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const bitchPage = pages.find((p) => p.kind === 'awards' && p.section === 'bitch');
    expect(bitchPage).toMatchObject({ kind: 'awards', section: 'bitch', awards: CHAMPIONSHIP_BITCH_AWARDS });
  });

  it('the back page carries ONLY the overall awards, unfiltered relative to each other but excluding dog- and bitch-restricted awards — no more full-list duplication', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(backPage).toMatchObject({ kind: 'awards', section: 'overall', awards: CHAMPIONSHIP_OVERALL_AWARDS });
  });

  it('dog- and bitch-side awards no longer appear on the back page at all', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    const backAwards = (backPage as Extract<JudgesBookPage, { kind: 'awards' }>).awards;
    for (const dogOrBitchAward of [...CHAMPIONSHIP_DOG_AWARDS, ...CHAMPIONSHIP_BITCH_AWARDS]) {
      expect(backAwards).not.toContain(dogOrBitchAward);
    }
  });

  it('is always the very last page when present', () => {
    const classes = [dogClass('1'), bitchClass('2'), sacClass('A'), jhClass('JHA')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pages[pages.length - 1]).toMatchObject({ kind: 'awards', section: 'overall' });
  });

  it('a championship-show award list: the dog page gets only CCs + Best Puppy Dog, the bitch page gets only CCs + Best Puppy Bitch, the back page gets only the overall awards', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    const bitchPage = pages.find((p) => p.kind === 'awards' && p.section === 'bitch');
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(dogPage).toMatchObject({ awards: CHAMPIONSHIP_DOG_AWARDS });
    expect(bitchPage).toMatchObject({ awards: CHAMPIONSHIP_BITCH_AWARDS });
    expect(backPage).toMatchObject({ awards: CHAMPIONSHIP_OVERALL_AWARDS });
  });

  it('an open-show award list: the dog page gets only Best Dog, the bitch page gets only Best Bitch, the back page gets the remaining overall awards', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, OPEN_AWARDS);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    const bitchPage = pages.find((p) => p.kind === 'awards' && p.section === 'bitch');
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(dogPage).toMatchObject({ awards: ['Best Dog'] });
    expect(bitchPage).toMatchObject({ awards: ['Best Bitch'] });
    expect(backPage).toMatchObject({ awards: ['Best of Breed', 'Best Puppy in Show', 'Best Veteran in Show'] });
  });

  it('never drops an unclassifiable (bespoke) award — it rides the overall back page, and is never miscategorised onto the dog or bitch page', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const bestAwards = ['Dog Challenge Certificate', 'Best of Breed', 'The Smith Memorial Trophy'];
    const pages = buildJudgesBookPages(classes, bestAwards);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    const bitchPage = pages.find((p) => p.kind === 'awards' && p.section === 'bitch');
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(dogPage).toMatchObject({ awards: ['Dog Challenge Certificate'] });
    expect(bitchPage).toBeUndefined();
    expect(backPage).toMatchObject({ awards: ['Best of Breed', 'The Smith Memorial Trophy'] });
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

  it('no back page when every configured award is sexed (dog- or bitch-restricted) — nothing left for the overall page', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const sexedOnly = ['Dog Challenge Certificate', 'Bitch Challenge Certificate', 'Best Puppy Dog', 'Best Puppy Bitch'];
    const pages = buildJudgesBookPages(classes, sexedOnly);
    expect(pages.some((p) => p.kind === 'awards' && p.section === 'overall')).toBe(false);
    // Dog and bitch pages still render — only the back page is dropped.
    expect(pages.some((p) => p.kind === 'awards' && p.section === 'dog')).toBe(true);
    expect(pages.some((p) => p.kind === 'awards' && p.section === 'bitch')).toBe(true);
  });

  it('no bitch classes on the show, but bitch-side awards are configured — the bitch awards page still anchors right after the (empty) bitch section, immediately after the dog page', () => {
    const classes = [dogClass('1'), dogClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual([
      'class:1',
      'class:2',
      'awards:dog',
      'awards:bitch',
      'awards:overall',
    ]);
    const bitchPage = pages.find((p) => p.kind === 'awards' && p.section === 'bitch');
    expect(bitchPage).toMatchObject({ awards: CHAMPIONSHIP_BITCH_AWARDS });
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(backPage).toMatchObject({ awards: CHAMPIONSHIP_OVERALL_AWARDS });
  });

  it('no dog classes, but dog-side awards are configured — the dog awards page lands before the bitch section rather than being dropped', () => {
    const classes = [bitchClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual([
      'awards:dog',
      'class:1',
      'class:2',
      'awards:bitch',
      'awards:overall',
    ]);
  });

  it('neither dog nor bitch classes on the show, but both sexed award groups are configured — both pages still anchor back-to-back in the dog-then-bitch slot', () => {
    const classes = [sacClass('A'), jhClass('JHA')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual([
      'awards:dog',
      'awards:bitch',
      'class:A',
      'class:JHA',
      'awards:overall',
    ]);
  });

  it('reorders Special Award / Junior Handling classes that interleave dog and bitch in raw input order — the known route hazard', () => {
    // Raw sortOrder on some shows puts SAC/JH classes BETWEEN the dog and
    // bitch blocks. buildJudgesBookPages must re-bucket via sectionClasses,
    // not trust this input order, so the dog awards page still lands right
    // after the LAST dog class and the bitch awards page right after the
    // LAST bitch class, not after whatever happens to be last in the raw
    // array.
    const classes = [dogClass('1'), dogClass('2'), sacClass('A'), jhClass('JHA'), bitchClass('3'), bitchClass('4')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual([
      'class:1',
      'class:2',
      'awards:dog',
      'class:3',
      'class:4',
      'awards:bitch',
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

  it('preserves the secretary-configured award order on the bitch page', () => {
    const customOrder = ['Best Puppy Bitch', 'Bitch Challenge Certificate', 'Reserve Bitch Challenge Certificate'];
    const pages = buildJudgesBookPages([bitchClass('1')], customOrder);
    const bitchPage = pages.find((p) => p.kind === 'awards' && p.section === 'bitch');
    expect(bitchPage).toMatchObject({ awards: customOrder });
  });

  it('the back page reproduces the secretary-configured relative order of the overall awards, not reshuffled', () => {
    const customOrder = ['Best Puppy in Show', 'Best of Breed', 'Dog Challenge Certificate'];
    const pages = buildJudgesBookPages([dogClass('1'), bitchClass('2')], customOrder);
    const backPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(backPage).toMatchObject({ awards: ['Best Puppy in Show', 'Best of Breed'] });
  });
});
