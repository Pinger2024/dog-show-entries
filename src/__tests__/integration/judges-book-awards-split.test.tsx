import { describe, it, expect } from 'vitest';
import { JudgesBook, ClassPage, AwardsPage, JudgesBookCover } from '@/components/judges-book/judges-book';
import type { JudgesBookClass, JudgesBookShowInfo } from '@/app/api/judges-book/[showId]/route';

/**
 * Regression guard for the Judge's Book "Best Awards" split (Mandy
 * 2026-08-10, REVISED 2026-08-18 having now seen the rendered pages): "I
 * wouldnt edit the back awards page, just leave that with all the awards on
 * it as it is today, just need that extra page for the Male awards which
 * from the first image you sent and the last image looks fine." So this is
 * now a TWO-way split, not three:
 *   - a Dog Awards page, dog-side awards only, right after the last dog
 *     class page (kept, confirmed as-is).
 *   - NO separate Bitch Awards page.
 *   - the back page carries the FULL configured awards list, unfiltered,
 *     same as the single sign-off page did before the 08-10 split — the
 *     dog-side awards deliberately appear on BOTH the mid-book page and the
 *     back page.
 *
 * `buildJudgesBookPages` (lib/judges-book-pages.ts) owns the actual
 * ordering/classification logic and has its own exhaustive unit tests
 * (lib/__tests__/judges-book-pages.test.ts). This test protects the other
 * half: that `JudgesBook` really WIRES that function's output into the
 * page components rather than, say, still tacking a single page on the end
 * regardless. `JudgesBook` (like ShowSchedule/CatalogueByClass elsewhere in
 * this codebase) is a plain hook-free function component, so it can be
 * called directly and its returned React element tree walked in document
 * order — no react-pdf renderer needed.
 *
 * The class fixture below deliberately interleaves a Special Award and a
 * Junior Handling class BETWEEN the dog and bitch blocks — the known route
 * hazard (raw show_classes.sortOrder doesn't guarantee sex-major order) —
 * so this test also proves the reorder fix end to end, not just in the
 * pure function.
 */

function collectPageElements(node: unknown, out: { type: unknown; props: Record<string, unknown> }[] = []) {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectPageElements(child, out);
    return out;
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: Record<string, unknown> };
    if (el.type === JudgesBookCover || el.type === ClassPage || el.type === AwardsPage) {
      out.push({ type: el.type, props: el.props ?? {} });
    }
    if (el.props?.children !== undefined) {
      collectPageElements(el.props.children, out);
    }
  }
  return out;
}

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

const show: JudgesBookShowInfo = {
  name: 'South Western GSD Championship Show',
  showType: 'championship',
  date: '2026-08-29',
  organisation: 'South Western German Shepherd Dog Club',
  logoUrl: null,
  judgeName: null,
  bestAwards: CHAMPIONSHIP_AWARDS,
};

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

// Raw sortOrder as it would come out of the DB on an interleaved show: dog,
// dog, SAC, JH, bitch, bitch — Special Award and Junior Handling classes
// sitting between the sexes rather than after both.
const classes: JudgesBookClass[] = [
  cls({ classLabel: '1', className: 'Yearling', sex: 'dog' }),
  cls({ classLabel: '2', className: 'Open', sex: 'dog' }),
  cls({
    classLabel: 'A',
    className: 'Special Award Class - Open',
    sex: null,
    classType: 'special',
    judgeName: 'Ms K Salamon',
  }),
  cls({
    classLabel: 'JHA',
    className: 'Junior Handling',
    sex: null,
    classType: 'junior_handler',
    isJh: true,
    judgeName: 'Mandy McAteer',
  }),
  cls({ classLabel: '3', className: 'Yearling', sex: 'bitch' }),
  cls({ classLabel: '4', className: 'Open', sex: 'bitch' }),
];

describe('JudgesBook — Dog Awards mid-book, full Best Awards on the back page', () => {
  it('renders cover, then dog classes, dog awards, bitch classes, special, JH, then the full back page — NO separate bitch awards page', () => {
    const tree = JudgesBook({ show, classes });
    const pages = collectPageElements(tree);

    expect(pages[0]!.type).toBe(JudgesBookCover);

    const describe = pages.slice(1).map((p) => {
      if (p.type === ClassPage) {
        const c = p.props.cls as JudgesBookClass;
        return `class:${c.classLabel}`;
      }
      return `awards:${p.props.section as string}`;
    });

    expect(describe).toEqual([
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

  it('the dog awards page carries only the dog-restricted awards', () => {
    const tree = JudgesBook({ show, classes });
    const pages = collectPageElements(tree);
    const dogAwardsPage = pages.find((p) => p.type === AwardsPage && p.props.section === 'dog')!;
    expect(dogAwardsPage.props.awards).toEqual([
      'Dog Challenge Certificate',
      'Reserve Dog Challenge Certificate',
      'Best Puppy Dog',
    ]);
  });

  it('does not render a bitch awards page at all', () => {
    const tree = JudgesBook({ show, classes });
    const pages = collectPageElements(tree);
    expect(pages.some((p) => p.type === AwardsPage && p.props.section === 'bitch')).toBe(false);
  });

  it('the back page carries the FULL configured awards list, unfiltered — including the dog-side awards already shown mid-book', () => {
    const tree = JudgesBook({ show, classes });
    const pages = collectPageElements(tree);
    const backPage = pages.find((p) => p.type === AwardsPage && p.props.section === 'overall')!;
    expect(backPage.props.awards).toEqual(CHAMPIONSHIP_AWARDS);
  });

  it('a show with no configured Best Awards renders class pages only — no awards pages at all', () => {
    const noAwardsShow: JudgesBookShowInfo = { ...show, bestAwards: [] };
    const tree = JudgesBook({ show: noAwardsShow, classes });
    const pages = collectPageElements(tree);
    expect(pages.some((p) => p.type === AwardsPage)).toBe(false);
    expect(pages.filter((p) => p.type === ClassPage)).toHaveLength(classes.length);
  });
});
