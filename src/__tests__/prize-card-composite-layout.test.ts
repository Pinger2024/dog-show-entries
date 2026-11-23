/**
 * Prize card face layout — Mandy 2026-08-16.
 *
 * She reported two faults on the cards clubs actually download (the
 * COMPOSITE renderer — not prize-cards.tsx or prize-card-overprint.tsx;
 * three designs exist and it is easy to test the wrong one):
 *   1. the club logo never printed — for ANY club;
 *   2. duplicated information — the card printed the club name and then the
 *      full show name, which already contains both the club name and the
 *      show type ("GSD Club of Scotland" / "GSD Club of Scotland
 *      Championship Show" / "Championship Show").
 *
 * She specified the running order herself:
 *   club logo → club name → show type → date → judge (+ affix) → class.
 *
 * These tests walk the element tree the component returns, so they assert
 * the real render order without needing to parse a PDF.
 */
import { describe, it, expect } from 'vitest';
type AnyElement = { props?: Record<string, unknown> };
import {
  PrizeCardComposite,
  type CompositeShowInfo,
} from '@/components/prize-cards/prize-card-composite';
import type { PrizeCardPage } from '@/lib/prize-card-pages';

const SHOW: CompositeShowInfo = {
  clubName: 'GSD Club of Scotland',
  showName: 'GSD Club of Scotland Championship Show',
  showType: 'championship',
  date: '2026-08-30',
  logoUrl: 'data:image/png;base64,PLACEHOLDERLOGO',
};

const PAGES: PrizeCardPage[] = [
  { placement: 1, judgeLine: 'Mrs J McArthur (Fortissat)', classLine: 'Class 1 — Minor Puppy Dog' },
];

/** Depth-first list of every element in the tree, in render order. */
function flatten(node: unknown, out: AnyElement[] = []): AnyElement[] {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  const el = node as AnyElement;
  if (el.props !== undefined) {
    out.push(el);
    flatten(el.props.children, out);
  }
  return out;
}

/** The visible text of each Text element, in order. */
function textLines(tree: AnyElement[]): string[] {
  return tree
    .filter((el) => typeof el.props?.children === 'string' && (el.props.children as string).trim() !== '')
    .map((el) => (el.props!.children as string).trim());
}

function render(show: CompositeShowInfo = SHOW, pages = PAGES) {
  return flatten(PrizeCardComposite({ show, pages }) as unknown);
}

describe('prize card composite — club logo', () => {
  it('renders the club logo on the card', () => {
    const imageSrcs = render()
      .filter((el) => typeof el.props?.src === 'string')
      .map((el) => el.props!.src as string);
    expect(imageSrcs).toContain(SHOW.logoUrl);
  });

  it('omits the logo cleanly when the club has not uploaded one', () => {
    const tree = render({ ...SHOW, logoUrl: null });
    const imageSrcs = tree
      .filter((el) => typeof el.props?.src === 'string')
      .map((el) => el.props!.src as string);
    // Only the placement template artwork remains.
    expect(imageSrcs.every((src) => src.endsWith('.jpg'))).toBe(true);
    // ...and the rest of the card still renders.
    expect(textLines(tree)).toContain('GSD Club of Scotland');
  });
});

describe('prize card composite — no duplicated information', () => {
  it('does not print the full show name (it repeats the club and the type)', () => {
    expect(textLines(render())).not.toContain(
      'GSD Club of Scotland Championship Show'
    );
  });

  it('prints the club name exactly once', () => {
    const occurrences = textLines(render()).filter((line) =>
      line.includes('GSD Club of Scotland')
    );
    expect(occurrences).toHaveLength(1);
  });

  it('prints the show type on its own, not bolted onto the date', () => {
    expect(textLines(render())).toContain('Championship Show');
  });
});

describe('prize card composite — Mandy\'s running order', () => {
  it('runs club name → show type → date → judge → class', () => {
    const lines = textLines(render());
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));

    const club = at('GSD Club of Scotland');
    const type = at('Championship Show');
    const date = at('30 August 2026');
    const judge = at('Mrs J McArthur');
    const klass = at('Minor Puppy Dog');

    expect(club).toBeGreaterThanOrEqual(0);
    expect(type).toBeGreaterThan(club);
    expect(date).toBeGreaterThan(type);
    expect(judge).toBeGreaterThan(date);
    // Judge BEFORE class — the old card had these the other way round.
    expect(klass).toBeGreaterThan(judge);
  });

  it('puts the logo above the club name', () => {
    const tree = render();
    const logoIdx = tree.findIndex((el) => el.props?.src === SHOW.logoUrl);
    const clubIdx = tree.findIndex((el) => el.props?.children === SHOW.clubName);
    expect(logoIdx).toBeGreaterThanOrEqual(0);
    expect(clubIdx).toBeGreaterThan(logoIdx);
  });
});
