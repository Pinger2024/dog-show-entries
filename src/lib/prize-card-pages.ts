/**
 * Builds the ordered page list for the Prize Cards PDF — one PDF page PER
 * PHYSICAL CARD needed, not one page per placement.
 *
 * Mandy, 2026-07-30: "the file needs to be the full suite of 22 1st, 17 2nd
 * etc rather than just one copy — for Doxzoo printing we need the full pdf
 * otherwise it's classed as copies and more expensive." Doxzoo (and print
 * shops generally) price a single upload with N unique pages differently
 * from "one page, print N copies" — so the PDF must literally contain a
 * page per card, even though most pages within a placement are identical.
 *
 * Counting rule — same as computePrizeCardCounts (src/lib/prize-card-counts.ts):
 * a class needs a card for place k iff it has >= k CONFIRMED entries, capped
 * at 4 places (1st/2nd/3rd/Reserve). A class's total page count is the SAME
 * number that feeds computePrizeCardCounts, so this document's page count
 * always ties back to the "cards needed" line on the Documents page.
 *
 * Judge attribution: each class carries its OWN resolved judge (see
 * resolveJudgeForClass in src/lib/judge-resolution.ts — callers MUST run
 * classes through that resolver before building this input, so Special
 * Award Classes and Junior Handling get their own judge rather than
 * silently inheriting the breed judge). Classes sharing the same judge
 * aggregate into one stack per placement so the printed set groups
 * naturally by judge, matching the pre-existing overprint/composite
 * pagination convention.
 *
 * Page order: placement-major (all 1st cards, then all 2nd, then 3rd, then
 * Reserve), and within a placement, judge-major in first-seen order, with
 * that judge's repeat cards stacked together — "22× 1st (judge A's stack,
 * then judge B's), then 17× 2nd, ..." (Mandy's own phrasing).
 */

export type PrizeCardClassInput = {
  /** Confirmed entries in this class (see getPrizeCardCounts for the exact
   *  status='confirmed' AND deletedAt IS NULL filter this must be computed
   *  with). Determines how many placements — 1..min(n, 4) — this class
   *  contributes cards to. */
  confirmedCount: number;
  /** Resolved judge for this specific class (via resolveJudgeForClass), or
   *  null if no judge is assigned yet. */
  judgeId: string | null;
  judgeName: string | null;
  judgeAffix?: string | null;
};

export type Placement = 1 | 2 | 3 | 4;

export type PrizeCardPage = {
  placement: Placement;
  /** Pre-formatted "Judge: Name (Affix)" line, or null when no judge is
   *  assigned to this class yet. */
  judgeLine: string | null;
};

const PLACEMENTS: Placement[] = [1, 2, 3, 4];

/** Key classes with no assigned judge all bucket together under one
 *  "no judge" group — there's no distinguishing detail to split them on,
 *  and the PDF just omits the judge line for that stack. */
const NO_JUDGE_KEY = '__no_judge__';

function formatJudgeLine(name: string, affix?: string | null): string {
  return affix ? `Judge: ${name} (${affix})` : `Judge: ${name}`;
}

export function buildPrizeCardPages(classes: PrizeCardClassInput[]): PrizeCardPage[] {
  type Group = { judgeLine: string | null; countsByPlacement: [number, number, number, number] };

  const order: string[] = [];
  const groups = new Map<string, Group>();

  for (const cls of classes) {
    // Cap at 4 (Reserve) — no 5th/VHC template exists, and negative/NaN
    // input (shouldn't happen, but this is a public pure function) never
    // contributes cards.
    const cardsNeeded = Math.min(Math.max(0, Math.trunc(cls.confirmedCount) || 0), 4);
    if (cardsNeeded <= 0) continue;

    const key = cls.judgeId ?? NO_JUDGE_KEY;
    let group = groups.get(key);
    if (!group) {
      const judgeLine = cls.judgeId && cls.judgeName
        ? formatJudgeLine(cls.judgeName, cls.judgeAffix)
        : null;
      group = { judgeLine, countsByPlacement: [0, 0, 0, 0] };
      groups.set(key, group);
      order.push(key);
    }
    for (let p = 0; p < cardsNeeded; p++) {
      group.countsByPlacement[p] += 1;
    }
  }

  const pages: PrizeCardPage[] = [];
  for (const placement of PLACEMENTS) {
    for (const key of order) {
      const group = groups.get(key)!;
      const count = group.countsByPlacement[placement - 1];
      for (let i = 0; i < count; i++) {
        pages.push({ placement, judgeLine: group.judgeLine });
      }
    }
  }
  return pages;
}
