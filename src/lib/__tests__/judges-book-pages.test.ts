import { describe, it, expect } from 'vitest';
import { buildJudgesBookPages, type JudgesBookPage } from '../judges-book-pages';
import type { JudgesBookClass } from '@/app/api/judges-book/[showId]/route';

// Mandy 2026-08-10 (re-requested 2026-08-18, two shows about to print):
// split the one combined "Best Awards" page at the very end of the book
// into three, each placed where that decision is actually made — dog-side
// awards after the last dog class, bitch-side awards after the last bitch
// class, overall awards (Best of Breed, Best in Show, …) on the back page
// same as before.
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
  it('places the dog awards page immediately after the last dog class and before the first bitch class', () => {
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

  it('places the bitch awards page immediately after the last bitch class', () => {
    const classes = [dogClass('1'), bitchClass('2'), bitchClass('3')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const bitchAwardsIdx = pages.findIndex((p) => p.kind === 'awards' && p.section === 'bitch');
    const lastBitchClassIdx = pages.findIndex(
      (p) => p.kind === 'class' && p.class.classLabel === '3',
    );
    expect(bitchAwardsIdx).toBe(lastBitchClassIdx + 1);
  });

  it('the back (overall) page carries ONLY the overall awards, never a dog- or bitch-restricted one', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const overallPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(overallPage).toMatchObject({ kind: 'awards', section: 'overall', awards: ['Best of Breed', 'Best Puppy in Show'] });
  });

  it('is always the very last page', () => {
    const classes = [dogClass('1'), bitchClass('2'), sacClass('A'), jhClass('JHA')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pages[pages.length - 1]).toMatchObject({ kind: 'awards', section: 'overall' });
  });

  it('splits a championship-show award list correctly: CCs + Best Puppy Dog/Bitch on their sex page, Best of Breed + Best Puppy in Show on the back page', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    const bitchPage = pages.find((p) => p.kind === 'awards' && p.section === 'bitch');
    const overallPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(dogPage).toMatchObject({
      awards: ['Dog Challenge Certificate', 'Reserve Dog Challenge Certificate', 'Best Puppy Dog'],
    });
    expect(bitchPage).toMatchObject({
      awards: ['Bitch Challenge Certificate', 'Reserve Bitch Challenge Certificate', 'Best Puppy Bitch'],
    });
    expect(overallPage).toMatchObject({ awards: ['Best of Breed', 'Best Puppy in Show'] });
  });

  it('splits an open-show award list correctly: Best Dog/Best Bitch on their sex page, everything else on the back page', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, OPEN_AWARDS);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    const bitchPage = pages.find((p) => p.kind === 'awards' && p.section === 'bitch');
    const overallPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(dogPage).toMatchObject({ awards: ['Best Dog'] });
    expect(bitchPage).toMatchObject({ awards: ['Best Bitch'] });
    expect(overallPage).toMatchObject({ awards: ['Best of Breed', 'Best Puppy in Show', 'Best Veteran in Show'] });
  });

  it('never drops an unclassifiable (bespoke) award — it lands on the back page with the overalls', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, ['Best of Breed', 'The Smith Memorial Trophy']);
    const overallPage = pages.find((p) => p.kind === 'awards' && p.section === 'overall');
    expect(overallPage).toMatchObject({ awards: ['Best of Breed', 'The Smith Memorial Trophy'] });
    // And it must not have been silently classified onto the dog or bitch page.
    expect(pages.some((p) => p.kind === 'awards' && p.section !== 'overall' && p.awards.includes('The Smith Memorial Trophy'))).toBe(false);
  });

  it('a show with no configured Best Awards renders no awards pages at all', () => {
    const classes = [dogClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, []);
    expect(pages.every((p) => p.kind === 'class')).toBe(true);
    expect(classPageLabels(pages)).toEqual(['1', '2']);
  });

  it('no bitch classes, but bitch-side awards are configured — the bitch awards page lands after the dog section rather than being dropped', () => {
    const classes = [dogClass('1'), dogClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual(['class:1', 'class:2', 'awards:dog', 'awards:bitch', 'awards:overall']);
  });

  it('no dog classes, but dog-side awards are configured — the dog awards page lands before the bitch section rather than being dropped', () => {
    const classes = [bitchClass('1'), bitchClass('2')];
    const pages = buildJudgesBookPages(classes, CHAMPIONSHIP_AWARDS);
    expect(pageKindSequence(pages)).toEqual(['awards:dog', 'class:1', 'class:2', 'awards:bitch', 'awards:overall']);
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
      'awards:bitch',
      'class:A',
      'class:JHA',
      'awards:overall',
    ]);
  });

  it('preserves the secretary-configured award order within each page', () => {
    // Deliberately not in NAME_TO_TYPE canonical order.
    const customOrder = ['Best Puppy Dog', 'Dog Challenge Certificate', 'Reserve Dog Challenge Certificate'];
    const pages = buildJudgesBookPages([dogClass('1')], customOrder);
    const dogPage = pages.find((p) => p.kind === 'awards' && p.section === 'dog');
    expect(dogPage).toMatchObject({ awards: customOrder });
  });
});
