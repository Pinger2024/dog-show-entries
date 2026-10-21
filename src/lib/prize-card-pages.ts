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
 * silently inheriting the breed judge).
 *
 * PAGE ORDER IS CLASS-MAJOR (Mandy's correction, 2026-07-30, overriding an
 * earlier placement-major draft): "MPD 1st, 2nd followed by puppy dog 1st
 * 2nd, 3rd, junior dog, 1st etc" — i.e. for EACH CLASS IN ITS RUNNING
 * ORDER, that class's own achievable placements in sequence (1st, 2nd, …
 * up to Reserve), before moving to the next class. NOT grouped by
 * placement or by judge across classes.
 *
 * `classes` MUST already be given in running order — this function does
 * NOT sort or bucket, it only expands each class into its cards in the
 * order it's given. The caller is responsible for supplying that order:
 * the same running order the Judge's Book / catalogue use (show_classes
 * sorted by sortOrder/classNumber, then bucketed Dog → Bitch → Special
 * Awards → Junior Handling via the shared `sectionClasses` helper in
 * class-labels.ts — see prize-cards/route.ts).
 *
 * Class line + sex suffix: each card also shows its class's label (Mandy,
 * South Western: "the name of the class is on them", 2026-07-30) with the
 * sex appended for Dog/Bitch classes — "Minor Puppy Dog", "Minor Puppy
 * Bitch" (Mandy again, same day: "you need the sex on them"). Sexless
 * classes (Special Award, Junior Handling) get no suffix.
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
  /** Pre-formatted display label for this class, WITHOUT the sex suffix —
   *  e.g. "Class 1 — Minor Puppy", "Class JHA — Junior Handling". Callers
   *  build this from the canonical buildClassLabelMap (class-labels.ts)
   *  plus the class's own name — see prize-cards/route.ts. Never
   *  hand-format the numbering portion here. */
  classLabel: string;
  /** show_classes.sex — class definitions are sex-neutral ("Minor
   *  Puppy"), sex lives on the class row. Mandy, South Western: "you need
   *  the sex on them ie minor puppy dog, minor puppy bitch" (2026-07-30).
   *  Appended to classLabel to build classLine below; null (SAC/JH
   *  classes, or any sexless class) appends nothing. */
  sex?: 'dog' | 'bitch' | null;
};

export type Placement = 1 | 2 | 3 | 4;

export type PrizeCardPage = {
  placement: Placement;
  /** Pre-formatted "Judge: Name (Affix)" line, or null when no judge is
   *  assigned to this class yet. */
  judgeLine: string | null;
  /** This card's class label (see PrizeCardClassInput.classLabel) — Mandy,
   *  South Western: "the name of the class is on them" (2026-07-30). */
  classLine: string;
};

function formatJudgeLine(name: string, affix?: string | null): string {
  return affix ? `Judge: ${name} (${affix})` : `Judge: ${name}`;
}

/** No shared name+sex formatter exists elsewhere in the codebase
 *  (catalogue-by-breed.tsx and judges-book.tsx both append inline) — this
 *  matches that house pattern rather than inventing a new helper. */
function formatClassLine(classLabel: string, sex?: 'dog' | 'bitch' | null): string {
  if (sex === 'dog') return `${classLabel} Dog`;
  if (sex === 'bitch') return `${classLabel} Bitch`;
  return classLabel;
}

/**
 * `classesInRunningOrder` — one entry per show_class, already sorted in
 * running order (see module doc above). Returns the flat, ordered page
 * list: for each class in turn, its 1st..min(confirmedCount, 4) cards,
 * each carrying that class's own judge line.
 */
export function buildPrizeCardPages(classesInRunningOrder: PrizeCardClassInput[]): PrizeCardPage[] {
  const pages: PrizeCardPage[] = [];

  for (const cls of classesInRunningOrder) {
    // Cap at 4 (Reserve) — no 5th/VHC template exists, and negative/NaN
    // input (shouldn't happen, but this is a public pure function) never
    // contributes cards.
    const cardsNeeded = Math.min(Math.max(0, Math.trunc(cls.confirmedCount) || 0), 4);
    if (cardsNeeded <= 0) continue;

    // No judge assigned yet → a hand-writable blank, never a judge-less
    // card (Mandy 2026-08-17: "Judge: _________ … so that it can be hand
    // written in" — asked for the Scotland JH classes, applied to any
    // class still awaiting its judge).
    const judgeLine = cls.judgeId && cls.judgeName
      ? formatJudgeLine(cls.judgeName, cls.judgeAffix)
      : 'Judge: ______________________';

    const classLine = formatClassLine(cls.classLabel, cls.sex);

    for (let p = 1; p <= cardsNeeded; p++) {
      pages.push({ placement: p as Placement, judgeLine, classLine });
    }
  }

  return pages;
}
